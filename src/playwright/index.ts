/**
 * Playwright helpers for Visual Delta hosts.
 *
 * Minimal consumer:
 * ```ts
 * // tests/visual/storybook.spec.ts
 * import { defineVisualSuite } from "@lapismd/storybook-addon-visual-delta/playwright";
 * defineVisualSuite();
 *
 * // playwright.config.ts
 * import { defineVisualPlaywrightConfig } from "@lapismd/storybook-addon-visual-delta/playwright";
 * export default defineVisualPlaywrightConfig();
 * ```
 *
 * Or scaffold both with `visual-delta init`.
 */

export {
  defineVisualPlaywrightConfig,
  VISUAL_DEVICE_SCALE_FACTOR,
  VISUAL_VIEWPORT,
  visualPlaywrightUse,
  visualPlaywrightWebServer,
  visualScreenshotExpect,
  visualUpdateSnapshotsMode,
  type DefineVisualPlaywrightConfigOptions,
} from "./config.js";
export {
  DEFAULT_SNAPSHOT_DIR,
  defineVisualSuite,
  type VisualSuiteOptions,
} from "./suite.js";
export {
  settleVisualStoryPage,
  waitForVisualStoryFinished,
} from "./readiness.js";
export type { BaselinePathMode } from "../node/options.js";
export type {
  VisualBaselineEnvironment,
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "../shared/environments.js";
export type { VisualCaptureProfile } from "../shared/capture-profile.js";
export type { VisualTestFailureMode } from "../shared/failure-mode.js";
export {
  baselinePublicUrl,
  screenshotRelativePath,
  snapshotFileName,
  type StoryIndexEntry,
} from "../node/snapshot-paths.js";
