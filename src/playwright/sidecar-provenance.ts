import { randomUUID } from "node:crypto";
import { currentVisualCaptureProfile } from "../node/capture-profile.js";
import type { BaselinePathMode } from "../node/options.js";
import {
  screenshotRelativePath,
  type StoryIndexEntry,
} from "../node/snapshot-paths.js";
import type {
  VisualDiffSidecar,
  VisualDiffSidecarStatus,
} from "../visual-diff-sidecar.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
export function buildSidecarBase(
  entry: StoryIndexEntry,
  mode: BaselinePathMode,
  status: VisualDiffSidecarStatus,
  error?: string,
  visualModeName?: string,
  target?: { browser: VisualDeltaBrowser },
  packageRoot?: string,
): Omit<
  VisualDiffSidecar,
  | "imageWidth"
  | "imageHeight"
  | "viewport"
  | "deviceScaleFactor"
  | "diffPixels"
  | "totalPixels"
  | "diffPercent"
  | "passThresholdPercent"
  | "passed"
  | "changeBounds"
  | "diffHistogram"
  | "actualRel"
  | "diffRel"
> {
  return {
    version: 4,
    storyId: entry.id,
    title: entry.title,
    snapshotRel: screenshotRelativePath(entry, mode, visualModeName),
    status,
    runnerStatus: status,
    ...(target ? { browser: target.browser, target } : {}),
    captureProfile: currentVisualCaptureProfile(packageRoot),
    platform: currentVisualCaptureProfile(packageRoot).os,
    ...(visualModeName ? { mode: visualModeName } : {}),
    ...(error ? { error } : {}),
    generatedAt: new Date().toISOString(),
    tool: "playwright",
    operationId: randomUUID(),
  };
}
