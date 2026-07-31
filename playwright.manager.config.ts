import { defineVisualPlaywrightConfig } from "./src/playwright/config.js";
import { visualDeltaPackageStorybookOverride } from "./playwright.panel.config.js";

const hostStorybookPort = Number(process.env.STORYBOOK_PORT ?? "9009");
const staticPort = Number(
  process.env.VISUAL_DELTA_PANEL_STATIC_PORT ?? hostStorybookPort + 3,
);

/**
 * Manager / overlay / sidebar acceptance against the package Storybook.
 * Host-product stubs keep story IDs stable; not yet part of `pnpm checks`.
 */
export default defineVisualPlaywrightConfig({
  port: staticPort,
  testDir: "./tests",
  override: visualDeltaPackageStorybookOverride({
    includeHostStubs: true,
    testMatch: [
      "**/manager*.spec.ts",
      "**/overlay-placement.spec.ts",
    ],
  }),
});
