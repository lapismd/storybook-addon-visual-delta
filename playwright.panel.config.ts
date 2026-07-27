import { defineVisualPlaywrightConfig } from "./src/playwright/config.js";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const hostStorybookPort = Number(process.env.STORYBOOK_PORT ?? "9009");
const staticPort = Number(
  process.env.VISUAL_DELTA_PANEL_STATIC_PORT ?? hostStorybookPort + 3,
);
const panelStorybookPort = Number(
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ?? hostStorybookPort + 4,
);
const panelVisualPort = Number(
  process.env.VISUAL_DELTA_PANEL_VISUAL_PORT ?? hostStorybookPort + 5,
);

export default defineVisualPlaywrightConfig({
  port: staticPort,
  testDir: "./tests",
  override: {
    fullyParallel: false,
    workers: 1,
    webServer: [
      {
        command: `python3 -m http.server ${staticPort} --directory storybook-static --bind 127.0.0.1`,
        url: `http://127.0.0.1:${staticPort}/iframe.html`,
        cwd: packageRoot,
        reuseExistingServer: false,
        timeout: 120_000,
      },
      {
        command: `STORYBOOK_PORT=${panelStorybookPort} VISUAL_SERVER_PORT=${panelVisualPort} STORYBOOK_EXTRA_PORTS='${panelVisualPort} ${panelStorybookPort + 90}' pnpm storybook:ui --ci`,
        url: `http://127.0.0.1:${panelStorybookPort}/index.json`,
        cwd: packageRoot,
        reuseExistingServer: false,
        timeout: 120_000,
      },
    ],
    expect: {
      toHaveScreenshot: {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0,
        scale: "device",
      },
    },
  },
});
