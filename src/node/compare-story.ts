import { existsSync } from "node:fs";
import path from "node:path";
import {
  captureSubjectWithBrowser,
  type CaptureSubjectProgress,
} from "./capture-subject.js";
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
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import { parseVisualBaselineTarget } from "../shared/environments.js";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import type {
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "../shared/environments.js";

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
 * Capture and compare one live Storybook story without consulting or rebuilding
 * storybook-static. This is the authoritative backend for both Story and Diff
 * Browser manager actions.
 */
export async function compareLiveStoryWithBrowser(options: {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  request: CompareStoryRequest;
  onProgress?: (progress: CaptureSubjectProgress) => void;
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
  const { absolutePath } = resolveCompareStoryBaselinePath({
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

  const capture = await captureSubjectWithBrowser(
    {
      origin: options.request.origin,
      storyId,
      visualCaptureUntil: options.request.visualCaptureUntil,
      visualCaptureCallId: options.request.visualCaptureCallId,
      viewport: options.request.viewport,
      deviceScaleFactor: options.request.deviceScaleFactor,
      delay: options.request.delay,
      ignoreSelectors: options.request.ignoreSelectors,
      cropToViewport: options.request.cropToViewport,
      globals: options.request.globals,
      browser,
    },
    options.onProgress,
  );
  const captureConfig = {
    viewport: options.request.viewport,
    deviceScaleFactor: options.request.deviceScaleFactor,
    delay: options.request.delay,
    ignoreSelectors: options.request.ignoreSelectors ?? [],
    cropToViewport: options.request.cropToViewport ?? false,
    passThresholdPercent: options.request.passThresholdPercent,
    diffThreshold: options.request.diffThreshold,
    includeAntiAliasing: options.request.includeAntiAliasing ?? false,
    mode: options.request.mode ?? null,
    globals: options.request.globals ?? null,
    align: options.request.align ?? "viewport",
    interaction: options.request.visualCaptureUntil ?? null,
  };
  const sidecar = writeDiffArtifactsForBaseline({
    entry,
    packageRoot: options.root,
    snapshotDir: resolveSnapshotDir(options.hostOptions, options.root),
    mode: resolveBaselinePathMode(options.hostOptions),
    baselinePngAbsPath: absolutePath,
    status: "passed",
    actualPng: Buffer.from(capture.pngBase64, "base64"),
    visualModeName: options.request.mode,
    viewport: options.request.viewport,
    deviceScaleFactor: options.request.deviceScaleFactor,
    passThresholdPercent: options.request.passThresholdPercent,
    diffThreshold: options.request.diffThreshold,
    includeAntiAliasing: options.request.includeAntiAliasing,
    captureConfig,
    browser,
    failureMode: projectConfig.workflow.visualTestFailureMode,
  });
  return {
    ok: true,
    storyId,
    sidecar,
    target: { browser },
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
    environment: { browser, platform: CANONICAL_VISUAL_CAPTURE_PROFILE.os },
  };
}

/** Compatibility alias for existing Chromium callers. */
export const compareLiveStoryWithChromium = compareLiveStoryWithBrowser;
