import {
  defineVisualPlaywrightConfig,
  visualScreenshotExpect,
} from "./src/playwright/config.js";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const hostStorybookPort = Number(process.env.STORYBOOK_PORT ?? "9009");
const staticPort = Number(
  process.env.VISUAL_DELTA_PANEL_STATIC_PORT ?? hostStorybookPort + 3,
);
const panelStorybookPort = Number(
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
    process.env.VISUAL_DELTA_STORYBOOK_PORT ??
    hostStorybookPort + 4,
);
const panelVisualPort = Number(
  process.env.VISUAL_DELTA_PANEL_VISUAL_PORT ?? hostStorybookPort + 5,
);
const skipStaticBuild = process.env.VISUAL_DELTA_PANEL_SKIP_STATIC_BUILD === "1";
const staticServerCommand = skipStaticBuild
  ? `python3 -m http.server ${staticPort} --directory storybook-static --bind 127.0.0.1`
  : `pnpm build-storybook && python3 -m http.server ${staticPort} --directory storybook-static --bind 127.0.0.1`;

/** Shared webServer + ports for package Storybook acceptance. */
export function visualDeltaPackageStorybookOverride(
  options: {
    testMatch?: string | string[];
    /** Load host-stubs story IDs (manager/overlay acceptance). */
    includeHostStubs?: boolean;
  } = {},
) {
  return {
    ...(options.testMatch ? { testMatch: options.testMatch } : {}),
    fullyParallel: false,
    workers: 1 as const,
    snapshotPathTemplate:
      process.env.VISUAL_DELTA_CANONICAL_PANEL_SNAPSHOTS === "1"
        ? "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}"
        : "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
    webServer: [
      {
        command: staticServerCommand,
        url: `http://127.0.0.1:${staticPort}/iframe.html`,
        cwd: packageRoot,
        reuseExistingServer: false,
        timeout: 300_000,
      },
      {
        command: `VISUAL_DELTA_STORYBOOK_PORT=${panelStorybookPort} VISUAL_SERVER_PORT=${panelVisualPort}${
          options.includeHostStubs
            ? " VISUAL_DELTA_INCLUDE_HOST_STUBS=1"
            : ""
        } pnpm storybook:ci`,
        url: `http://127.0.0.1:${panelStorybookPort}/index.json`,
        cwd: packageRoot,
        reuseExistingServer: false,
        timeout: 180_000,
      },
    ],
    expect: {
      toHaveScreenshot: visualScreenshotExpect(packageRoot),
    },
  };
}

export default defineVisualPlaywrightConfig({
  port: staticPort,
  testDir: "./tests",
  // Committed panel snapshots are 3× device-pixel PNGs.
  deviceScaleFactor: 3,
  override: visualDeltaPackageStorybookOverride({
    // Gated self-test: panel harness screenshots + readiness on package Storybook.
    // Broader manager/overlay acceptance: `playwright.manager.config.ts`.
    testMatch: ["**/panel.spec.ts"],
  }),
});
