import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

export const VISUAL_MATRIX_FIXTURE_ROOT = path.join(
  process.cwd(),
  ".cache",
  "visual-delta-matrix",
);

export const VISUAL_MATRIX_SNAPSHOT_DIR = path.join(
  VISUAL_MATRIX_FIXTURE_ROOT,
  "snapshots",
);

const BROWSERS = ["chromium", "firefox", "webkit"] as const;

function solidPng(red: number, green: number, blue: number): Buffer {
  const png = new PNG({ width: 64, height: 48 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 1] = green;
    png.data[offset + 2] = blue;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function prepareVisualMatrixFixture(): void {
  rmSync(VISUAL_MATRIX_FIXTURE_ROOT, { recursive: true, force: true });
  const staticRoot = path.join(VISUAL_MATRIX_FIXTURE_ROOT, "storybook-static");
  mkdirSync(staticRoot, { recursive: true });
  mkdirSync(path.join(VISUAL_MATRIX_FIXTURE_ROOT, ".visual-delta"), {
    recursive: true,
  });
  mkdirSync(VISUAL_MATRIX_SNAPSHOT_DIR, { recursive: true });

  const entries = Object.fromEntries(
    ["pass", "missing", "mismatch", "broken"].map((name) => [
      `visual-matrix--${name}`,
      {
        id: `visual-matrix--${name}`,
        type: "story",
        title: "Visual Matrix",
        name,
        importPath: "./src/Matrix.stories.tsx",
        tags: [],
      },
    ]),
  );
  writeFileSync(
    path.join(staticRoot, "index.json"),
    `${JSON.stringify({ entries }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(staticRoot, "iframe.html"),
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; }
      #visual-subject { width: 64px; height: 48px; background: rgb(20, 120, 220); }
    </style>
  </head>
  <body>
    <div id="storybook-root"><div id="visual-subject"></div></div>
    <script>
      const storyId = new URLSearchParams(location.search).get("id") || "";
      if (storyId.endsWith("--broken")) {
        document.getElementById("storybook-root")?.remove();
      } else {
        document.documentElement.setAttribute("data-visual-delta-story-finished", storyId);
      }
    </script>
  </body>
</html>
`,
  );
  writeFileSync(
    path.join(VISUAL_MATRIX_FIXTURE_ROOT, ".visual-delta", "config.json"),
    `${JSON.stringify(
      {
        browsers: BROWSERS,
        workflow: { visualTestFailureMode: "warn" },
      },
      null,
      2,
    )}\n`,
  );

  const passing = solidPng(20, 120, 220);
  const mismatching = solidPng(220, 80, 40);
  for (const browser of BROWSERS) {
    writeFileSync(
      path.join(
        VISUAL_MATRIX_SNAPSHOT_DIR,
        `visual-matrix--pass-${browser}.png`,
      ),
      passing,
    );
    writeFileSync(
      path.join(
        VISUAL_MATRIX_SNAPSHOT_DIR,
        `visual-matrix--mismatch-${browser}.png`,
      ),
      mismatching,
    );
  }
}
