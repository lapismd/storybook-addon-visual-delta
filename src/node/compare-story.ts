import { existsSync } from "node:fs";
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
import { resolveVisualBaselinePath } from "./delete-baseline.js";
import { loadStoryIndex } from "./visual-sidecars.js";
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import { parseVisualBaselineEnvironment } from "../shared/environments.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

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
  const requestedEnvironment = parseVisualBaselineEnvironment(
    options.request.baselineUrl,
  );
  if (
    !requestedEnvironment ||
    requestedEnvironment.browser !== browser ||
    requestedEnvironment.platform !== process.platform
  ) {
    throw new Error(
      `Baseline environment must match ${browser}/${process.platform}.`,
    );
  }
  const requestEntry = options.request.story;
  if (requestEntry && requestEntry.id !== storyId) {
    throw new Error("Story metadata does not match the requested story");
  }
  const entry = requestEntry ?? loadStoryIndex(options.root)[storyId];
  if (!entry) {
    throw new Error(`Story not found in index: ${storyId}`);
  }
  const { absolutePath } = resolveVisualBaselinePath(
    options.root,
    options.hostOptions ?? {},
    {
      storyId,
      baselineUrl: options.request.baselineUrl,
      entry,
    },
  );
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
    platform: process.platform,
    failureMode: projectConfig.workflow.visualTestFailureMode,
  });
  return {
    ok: true,
    storyId,
    sidecar,
    environment: { browser, platform: process.platform },
  };
}

/** Compatibility alias for existing Chromium callers. */
export const compareLiveStoryWithChromium = compareLiveStoryWithBrowser;
