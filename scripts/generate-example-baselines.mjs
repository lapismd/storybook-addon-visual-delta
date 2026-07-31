/**
 * Regenerate package Example baseline PNGs (pngjs).
 * Usage: node ./scripts/generate-example-baselines.mjs
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(new URL("..", import.meta.url)));
const root = path.join(packageRoot, "tests/examples-snapshots/examples");

function fillRect(png, x, y, w, h, r, g, b) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= png.width || yy >= png.height) continue;
      const i = (png.width * yy + xx) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
}

function writePng(rel, width, height, paint) {
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, 248, 249, 250);
  paint(png);
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log("wrote", path.relative(packageRoot, out));
}

writePng("card/match.png", 320, 160, (png) => {
  fillRect(png, 16, 16, 288, 128, 255, 255, 255);
  fillRect(png, 16, 16, 288, 36, 30, 64, 120);
  fillRect(png, 32, 68, 180, 12, 55, 65, 80);
  fillRect(png, 32, 92, 220, 10, 120, 130, 145);
});
writePng("card/drift.png", 320, 160, (png) => {
  fillRect(png, 16, 16, 288, 128, 255, 255, 255);
  fillRect(png, 16, 16, 288, 36, 30, 64, 120);
  fillRect(png, 32, 68, 180, 12, 55, 65, 80);
  fillRect(png, 32, 92, 220, 10, 120, 130, 145);
});
writePng("gallery/default.png", 280, 120, (png) => {
  fillRect(png, 12, 12, 256, 96, 255, 255, 255);
  fillRect(png, 12, 12, 8, 96, 46, 125, 50);
  fillRect(png, 36, 40, 160, 14, 40, 50, 60);
});
writePng("gallery/compact.png", 280, 88, (png) => {
  fillRect(png, 12, 12, 256, 64, 255, 255, 255);
  fillRect(png, 12, 12, 8, 64, 46, 125, 50);
  fillRect(png, 36, 34, 140, 12, 40, 50, 60);
});
writePng("gallery/accent.png", 280, 120, (png) => {
  fillRect(png, 12, 12, 256, 96, 255, 255, 255);
  fillRect(png, 12, 12, 8, 96, 180, 90, 40);
  fillRect(png, 36, 40, 160, 14, 40, 50, 60);
});
writePng("interactions/idle.png", 300, 100, (png) => {
  fillRect(png, 20, 28, 120, 40, 30, 64, 120);
});
writePng("interactions/opened.png", 300, 160, (png) => {
  fillRect(png, 20, 28, 120, 40, 30, 64, 120);
  fillRect(png, 20, 76, 200, 64, 255, 255, 255);
  fillRect(png, 36, 92, 140, 10, 80, 90, 100);
});
writePng("modes/default.png", 260, 100, (png) => {
  fillRect(png, 16, 16, 228, 68, 255, 255, 255);
  fillRect(png, 32, 40, 120, 14, 40, 50, 60);
});
writePng("modes/compact.png", 260, 72, (png) => {
  fillRect(png, 16, 12, 228, 48, 255, 255, 255);
  fillRect(png, 32, 28, 100, 12, 40, 50, 60);
});
writePng("filter-chip/default.png", 240, 64, (png) => {
  fillRect(png, 16, 16, 100, 32, 230, 240, 255);
  fillRect(png, 28, 26, 60, 10, 30, 64, 120);
});
writePng("ai-reply/default.png", 320, 120, (png) => {
  fillRect(png, 16, 16, 288, 88, 245, 247, 250);
  fillRect(png, 32, 40, 200, 12, 60, 70, 85);
  fillRect(png, 32, 64, 160, 10, 120, 130, 145);
});
writePng("form-field/default.png", 280, 96, (png) => {
  fillRect(png, 16, 40, 248, 36, 255, 255, 255);
  fillRect(png, 16, 40, 248, 2, 30, 64, 120);
  fillRect(png, 28, 52, 100, 10, 120, 130, 145);
});
