import { defineVisualPlaywrightConfig } from "./src/playwright/config.js";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineVisualPlaywrightConfig({
  port: 9012,
  testDir: "./tests",
  override: {
    fullyParallel: false,
    workers: 1,
    webServer: [
      {
        command:
          "python3 -m http.server 9012 --directory storybook-static --bind 127.0.0.1",
        url: "http://127.0.0.1:9012/iframe.html",
        cwd: packageRoot,
        reuseExistingServer: false,
        timeout: 120_000,
      },
      {
        command:
          "STORYBOOK_PORT=9013 VISUAL_SERVER_PORT=9014 STORYBOOK_EXTRA_PORTS='9014 9913' pnpm storybook:ui --ci",
        url: "http://127.0.0.1:9013/index.json",
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
