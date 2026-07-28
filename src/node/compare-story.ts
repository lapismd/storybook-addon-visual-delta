import { existsSync } from "node:fs";
import {
  captureSubjectWithChromium,
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

/**
 * Capture and compare one live Storybook story without consulting or rebuilding
 * storybook-static. This is the authoritative backend for both Story and Diff
 * Chromium manager actions.
 */
export async function compareLiveStoryWithChromium(options: {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  request: CompareStoryRequest;
  onProgress?: (progress: CaptureSubjectProgress) => void;
}): Promise<CompareStoryResult> {
  const storyId = options.request.storyId.trim();
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

  const capture = await captureSubjectWithChromium(
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
  });
  return { ok: true, storyId, sidecar };
}
