import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test";
import {
  VISUAL_DEVICE_SCALE_FACTOR,
  VISUAL_VIEWPORT,
} from "../constants.js";
import { DEFAULT_VISUAL_SERVER_PORT } from "../node/options.js";

export { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT };

/** Playwright `updateSnapshots` gate used by Visual Delta suites. */
export function visualUpdateSnapshotsMode(): "none" | "missing" | "all" {
  if (process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS !== "1") return "none";
  return process.env.PLAYWRIGHT_UPDATE_MODE === "missing" ? "missing" : "all";
}

/**
 * Shared expect.toHaveScreenshot options (device-scale PNGs, no animation).
 */
export const visualScreenshotExpect = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.01,
  scale: "device" as const,
};

/**
 * Suggested Playwright `use` block for Visual Delta compare / update runs.
 */
export function visualPlaywrightUse(port = DEFAULT_VISUAL_SERVER_PORT) {
  return {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light" as const,
    reducedMotion: "reduce" as const,
    viewport: { ...VISUAL_VIEWPORT },
    deviceScaleFactor: VISUAL_DEVICE_SCALE_FACTOR,
    trace: "off" as const,
  };
}

/**
 * Suggested static Storybook webServer for Playwright.
 */
export function visualPlaywrightWebServer(port = DEFAULT_VISUAL_SERVER_PORT) {
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    command: `python3 -m http.server ${port} --directory storybook-static --bind 127.0.0.1`,
    url: `${baseURL}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  };
}

export type DefineVisualPlaywrightConfigOptions = {
  /** Static Storybook port (default 6007). */
  port?: number;
  /** Playwright testDir (default `./tests/visual`). */
  testDir?: string;
  /** Extra fields merged over the Visual Delta defaults. */
  override?: PlaywrightTestConfig;
};

/**
 * One-liner Playwright config for Visual Delta hosts.
 *
 * ```ts
 * // playwright.config.ts
 * import { defineVisualPlaywrightConfig } from "storybook-addon-visual-delta/playwright";
 * export default defineVisualPlaywrightConfig();
 * ```
 */
export function defineVisualPlaywrightConfig(
  options: DefineVisualPlaywrightConfigOptions = {},
): PlaywrightTestConfig {
  const port = options.port ?? DEFAULT_VISUAL_SERVER_PORT;
  const testDir = options.testDir ?? "./tests/visual";
  return defineConfig({
    testDir,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: process.env.CI ? 1 : undefined,
    updateSnapshots: visualUpdateSnapshotsMode(),
    reporter: [["list"], ["html", { open: "never" }]],
    timeout: 30_000,
    expect: {
      toHaveScreenshot: { ...visualScreenshotExpect },
    },
    use: visualPlaywrightUse(port),
    projects: [
      {
        name: "chromium",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { ...VISUAL_VIEWPORT },
          deviceScaleFactor: VISUAL_DEVICE_SCALE_FACTOR,
        },
      },
    ],
    webServer: visualPlaywrightWebServer(port),
    ...options.override,
  });
}
