import { defineVisualPlaywrightConfig } from "./src/playwright/config.js";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  prepareVisualMatrixFixture,
  VISUAL_MATRIX_FIXTURE_ROOT,
} from "./tests/visual-matrix/fixture.js";

const port = Number(process.env.VISUAL_DELTA_MATRIX_PORT ?? "9387");
if (
  !existsSync(
    path.join(VISUAL_MATRIX_FIXTURE_ROOT, "storybook-static", "index.json"),
  )
) {
  prepareVisualMatrixFixture();
}

export default defineVisualPlaywrightConfig({
  browsers: ["chromium", "firefox", "webkit"],
  port,
  testDir: "./tests/visual-matrix",
  override: {
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    outputDir: ".cache/visual-delta-matrix/results",
    snapshotPathTemplate:
      ".cache/visual-delta-matrix/snapshots/{arg}-{projectName}-{platform}{ext}",
    webServer: {
      command: `python3 -m http.server ${port} --directory storybook-static --bind 127.0.0.1`,
      cwd: VISUAL_MATRIX_FIXTURE_ROOT,
      url: `http://127.0.0.1:${port}/iframe.html`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  },
});
