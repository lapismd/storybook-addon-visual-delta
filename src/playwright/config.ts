import { createRequire } from "node:module";
import path from "node:path";
import type * as PlaywrightTest from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";
import { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT } from "../constants.js";
import { resolveVisualServerPort } from "../node/options.js";
import { readVisualDeltaProjectConfig } from "../node/project-config.js";
import { resolvePlaywrightPassThresholdPercent } from "../node/playwright-threshold.js";
import { PLAYWRIGHT_PASS_THRESHOLD_PERCENT } from "../visual-diff-sidecar.js";

export { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT };

/** Effective Playwright deviceScaleFactor from project config → built-in. */
export function resolveVisualDeviceScaleFactor(root = process.cwd()): number {
  const value = readVisualDeltaProjectConfig(root).defaults.deviceScaleFactor;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 8
    ? value
    : VISUAL_DEVICE_SCALE_FACTOR;
}

const requireFromHost = createRequire(path.join(process.cwd(), "package.json"));

function loadHostPlaywrightTest(): typeof PlaywrightTest {
  return requireFromHost("@playwright/test") as typeof PlaywrightTest;
}

/** Playwright `updateSnapshots` gate used by Visual Delta suites. */
export function visualUpdateSnapshotsMode(): "none" | "missing" | "all" {
  if (process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS !== "1") return "none";
  return process.env.PLAYWRIGHT_UPDATE_MODE === "missing" ? "missing" : "all";
}

/**
 * Shared expect.toHaveScreenshot options (device-scale PNGs, no animation).
 * `maxDiffPixelRatio` follows host `.visual-delta/playwright.json` when present.
 */
export function visualScreenshotExpect(root = process.cwd()) {
  const passThresholdPercent = resolvePlaywrightPassThresholdPercent(root);
  const ratio = passThresholdPercent / 100;
  return {
    animations: "disabled" as const,
    caret: "hide" as const,
    maxDiffPixelRatio: Number.isFinite(ratio)
      ? ratio
      : PLAYWRIGHT_PASS_THRESHOLD_PERCENT / 100,
    scale: "device" as const,
  };
}

/**
 * Suggested Playwright `use` block for Visual Delta compare / update runs.
 */
export function visualPlaywrightUse(
  port = resolveVisualServerPort(),
  root = process.cwd(),
) {
  return {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light" as const,
    reducedMotion: "reduce" as const,
    viewport: { ...VISUAL_VIEWPORT },
    deviceScaleFactor: resolveVisualDeviceScaleFactor(root),
    trace: "off" as const,
  };
}

/**
 * Suggested static Storybook webServer for Playwright.
 */
export function visualPlaywrightWebServer(port = resolveVisualServerPort()) {
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    command: `python3 -m http.server ${port} --directory storybook-static --bind 127.0.0.1`,
    // Prefer iframe.html so a partial static tree (index.json only) is not
    // treated as a healthy Playwright webServer.
    url: `${baseURL}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  };
}

export type DefineVisualPlaywrightConfigOptions = {
  /**
   * Static Storybook port. Defaults to Storybook port + 1
   * (`STORYBOOK_PORT` / `VISUAL_SERVER_PORT` — see `resolveVisualServerPort`).
   */
  port?: number;
  /** Playwright testDir (default `./tests/visual`). */
  testDir?: string;
  /**
   * Explicit capture density. Defaults to project `deviceScaleFactor`, then
   * the built-in default (`1`).
   */
  deviceScaleFactor?: number;
  /** Extra fields merged over the Visual Delta defaults. */
  override?: PlaywrightTestConfig;
};

/**
 * One-liner Playwright config for Visual Delta hosts.
 *
 * ```ts
 * // playwright.config.ts
 * import { defineVisualPlaywrightConfig } from "@lapismd/storybook-addon-visual-delta/playwright";
 * export default defineVisualPlaywrightConfig();
 * ```
 */
export function defineVisualPlaywrightConfig(
  options: DefineVisualPlaywrightConfigOptions = {},
): PlaywrightTestConfig {
  const { defineConfig, devices } = loadHostPlaywrightTest();
  const port = options.port ?? resolveVisualServerPort();
  const testDir = options.testDir ?? "./tests/visual";
  const deviceScaleFactor =
    options.deviceScaleFactor ?? resolveVisualDeviceScaleFactor();
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
      toHaveScreenshot: { ...visualScreenshotExpect() },
    },
    use: {
      ...visualPlaywrightUse(port),
      deviceScaleFactor,
    },
    projects: [
      {
        name: "chromium",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { ...VISUAL_VIEWPORT },
          deviceScaleFactor,
        },
      },
    ],
    webServer: visualPlaywrightWebServer(port),
    ...options.override,
  });
}
