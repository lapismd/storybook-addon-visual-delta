import { defineVisualPlaywrightConfig } from "./src/playwright/config.js";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const hostStorybookPort = Number(process.env.STORYBOOK_PORT ?? "9009");
const panelStorybookPort = Number(
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
    process.env.VISUAL_DELTA_STORYBOOK_PORT ??
    hostStorybookPort + 4,
);
const panelVisualPort = Number(
  process.env.VISUAL_DELTA_PANEL_VISUAL_PORT ?? hostStorybookPort + 5,
);

/**
 * Manager / overlay / sidebar acceptance against the **live** package Storybook
 * (host stubs + middleware). Static `storybook-static` is not used here — panel
 * screenshot acceptance stays on `playwright.panel.config.ts`.
 */
export default defineVisualPlaywrightConfig({
  port: panelStorybookPort,
  testDir: "./tests",
  deviceScaleFactor: 3,
  override: {
    testMatch: ["**/manager*.spec.ts", "**/overlay-placement.spec.ts"],
    fullyParallel: false,
    workers: 1,
    timeout: 60_000,
    webServer: {
      command: `VISUAL_DELTA_STORYBOOK_PORT=${panelStorybookPort} VISUAL_SERVER_PORT=${panelVisualPort} VISUAL_DELTA_INCLUDE_HOST_STUBS=1 VISUAL_DELTA_PACKAGE_BASELINES=1 pnpm storybook:ci`,
      url: `http://127.0.0.1:${panelStorybookPort}/index.json`,
      cwd: packageRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  },
});
