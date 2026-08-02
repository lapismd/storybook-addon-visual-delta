import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { CaptureSubjectProgress } from "./capture-subject.js";
import type {
  CompareStoryRequest,
  CompareStoryResult,
} from "../shared/compare-story-types.js";
import {
  resolveBaselinePathMode,
  resolveSnapshotDir,
  type VisualDeltaHostOptions,
} from "./options.js";
import {
  relativeBaselinePath,
  resolveVisualBaselinePath,
} from "./delete-baseline.js";
import { loadStoryIndex } from "./visual-sidecars.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";
import { parseVisualBaselineTarget } from "../shared/environments.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import type {
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "../shared/environments.js";
import { runVisualDeltaCaptureJob } from "./capture-runner.js";
import { isVisualDiffSidecar, type VisualDiffSidecar } from "../visual-diff-sidecar.js";

export function validateCompareStoryBaselineTarget(options: {
  baselineUrl: string;
  browser: VisualDeltaBrowser;
  target?: VisualBaselineTarget;
}): VisualBaselineTarget {
  const encodedTarget = parseVisualBaselineTarget(options.baselineUrl);
  if (encodedTarget) {
    if (
      encodedTarget.browser !== options.browser ||
      (options.target && options.target.browser !== encodedTarget.browser)
    ) {
      throw new Error(`Baseline target must match ${options.browser}.`);
    }
    return encodedTarget;
  }
  if (options.target?.browser !== options.browser) {
    throw new Error(`Baseline target must match ${options.browser}.`);
  }
  return { browser: options.browser };
}

/**
 * Resolve a baseline for read-only live comparison. Canonical baselines retain
 * the story-ownership validation shared with mutation routes. Explicitly
 * targeted teaching assets may use an unqualified PNG name, but remain confined
 * to the mounted snapshot directory and never enter the mutation resolver.
 */
export function resolveCompareStoryBaselinePath(options: {
  root: string;
  hostOptions: VisualDeltaHostOptions;
  storyId: string;
  baselineUrl: string;
  browser: VisualDeltaBrowser;
  target?: VisualBaselineTarget;
  entry?: StoryIndexEntry;
}): { absolutePath: string; relativePath: string; snapshotRoot: string } {
  validateCompareStoryBaselineTarget(options);
  if (parseVisualBaselineTarget(options.baselineUrl)) {
    return resolveVisualBaselinePath(options.root, options.hostOptions, {
      storyId: options.storyId,
      baselineUrl: options.baselineUrl,
      entry: options.entry,
    });
  }

  const relativePath = relativeBaselinePath(options.baselineUrl);
  if (
    !relativePath.toLowerCase().endsWith(".png") ||
    /\.(?:actual|diff)\.png$/i.test(relativePath)
  ) {
    throw new Error(`Unsupported baseline target: ${relativePath}`);
  }
  const snapshotRoot = path.resolve(
    resolveSnapshotDir(options.hostOptions, options.root),
  );
  const absolutePath = path.resolve(
    snapshotRoot,
    ...relativePath.split("/"),
  );
  if (
    absolutePath !== snapshotRoot &&
    !absolutePath.startsWith(`${snapshotRoot}${path.sep}`)
  ) {
    throw new Error("Baseline screenshot resolves outside the snapshot folder");
  }
  return { absolutePath, relativePath, snapshotRoot };
}

/**
 * Compare one exact Storybook target through the same packaged CLI worker,
 * static suite, configured browser, and canonical capture runner as command
 * line visual tests.
 */
export async function compareStoryInCaptureRunner(options: {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  request: CompareStoryRequest;
  onProgress?: (progress: CaptureSubjectProgress) => void;
  onLog?: (line: string) => void;
}): Promise<CompareStoryResult> {
  const storyId = options.request.storyId.trim();
  const browser = options.request.browser ?? "chromium";
  const projectConfig = readVisualDeltaProjectConfig(options.root);
  const configErrors = projectConfig.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configErrors.length > 0) {
    throw new Error(configErrors.map((diagnostic) => diagnostic.message).join(" "));
  }
  if (!projectConfig.browsers.includes(browser)) {
    throw new Error(`Browser ${browser} is not enabled in project configuration.`);
  }
  const requestEntry = options.request.story;
  if (requestEntry && requestEntry.id !== storyId) {
    throw new Error("Story metadata does not match the requested story");
  }
  const entry = requestEntry ?? loadStoryIndex(options.root)[storyId];
  if (!entry) {
    throw new Error(`Story not found in index: ${storyId}`);
  }
  const { absolutePath, relativePath } = resolveCompareStoryBaselinePath({
    root: options.root,
    hostOptions: options.hostOptions ?? {},
    storyId,
    baselineUrl: options.request.baselineUrl,
    browser,
    target: options.request.target,
    entry,
  });
  if (!existsSync(absolutePath)) {
    throw new Error(`No baseline screenshot for ${storyId}`);
  }

  const configuredSnapshotDir = options.hostOptions?.snapshotDir?.trim();
  const affectedOptions = options.hostOptions?.affectedTests || undefined;
  const argv = [
    "test",
    "--story-id",
    storyId,
    "--browser",
    browser,
    "--failure-mode",
    projectConfig.workflow.visualTestFailureMode,
    "--baseline-path-mode",
    resolveBaselinePathMode(options.hostOptions),
    ...(!parseVisualBaselineTarget(options.request.baselineUrl)
      ? ["--baseline-rel", relativePath]
      : []),
    ...(configuredSnapshotDir ? ["--snapshot-dir", configuredSnapshotDir] : []),
    ...(options.hostOptions?.visualTestArgs ?? []).flatMap((argument) => [
      "--visual-test-arg",
      argument,
    ]),
    ...(affectedOptions && affectedOptions.cacheDir
      ? ["--cache-dir", affectedOptions.cacheDir]
      : []),
    ...((affectedOptions && affectedOptions.externals) ?? []).flatMap((glob) => [
      "--external",
      glob,
    ]),
    ...((affectedOptions && affectedOptions.untraced) ?? []).flatMap((glob) => [
      "--untraced",
      glob,
    ]),
    ...(options.request.visualCaptureUntil
      ? ["--step-id", options.request.visualCaptureUntil]
      : []),
    ...(options.request.visualCaptureCallId
      ? ["--capture-call-id", options.request.visualCaptureCallId]
      : []),
  ];
  options.onProgress?.({ phase: "launching", label: "Starting capture runner…" });
  const result = await runVisualDeltaCaptureJob({
    root: options.root,
    argv,
    operation: "test",
    storyIds: [storyId],
    browsers: [browser],
    failureMode: projectConfig.workflow.visualTestFailureMode,
    context: {
      onEvent(event) {
        if (event.type === "start") {
          options.onProgress?.({ phase: "navigating", label: "Preparing canonical Storybook…" });
        } else if (event.type === "log") {
          options.onLog?.(event.message);
          options.onProgress?.({ phase: "capturing", label: "Running visual comparison…" });
        }
      },
    },
  });
  const sidecarPath = absolutePath.replace(/\.png$/i, ".json");
  const sidecarRelativeToRoot = path
    .relative(options.root, sidecarPath)
    .replaceAll(path.sep, "/");
  const returnedSidecar = result.stagedArtifacts?.some(
    (artifact) =>
      artifact.relativePath.replaceAll("\\", "/") === sidecarRelativeToRoot,
  );
  if (!returnedSidecar || !existsSync(sidecarPath)) {
    throw new Error(
      `Capture runner exited ${result.exitCode} without an exact comparison sidecar for ${storyId}.`,
    );
  }
  const parsed = JSON.parse(readFileSync(sidecarPath, "utf8")) as unknown;
  if (!isVisualDiffSidecar(parsed)) {
    throw new Error(`Capture runner returned an invalid sidecar for ${storyId}.`);
  }
  const sidecar: VisualDiffSidecar = parsed;
  if (
    sidecar.storyId !== storyId ||
    sidecar.target?.browser !== browser ||
    !sidecar.captureProfile ||
    !isDeepStrictEqual(sidecar.captureProfile, result.profile) ||
    (options.request.mode != null && sidecar.mode !== options.request.mode)
  ) {
    throw new Error(`Capture runner returned sidecar metadata for another target.`);
  }
  options.onProgress?.({ phase: "encoding", label: "Loading comparison result…" });
  return {
    ok: true,
    storyId,
    sidecar,
    target: { browser },
    captureProfile: result.profile,
    environment: { browser, platform: result.profile.os },
  };
}

/** Compatibility aliases for callers using the former host-live name. */
export const compareLiveStoryWithBrowser = compareStoryInCaptureRunner;
export const compareLiveStoryWithChromium = compareStoryInCaptureRunner;
