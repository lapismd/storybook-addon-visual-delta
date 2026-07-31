/**
 * Regenerate package Example baseline PNGs (pngjs).
 * CSS sizes match `src/stories/examples/example-sizes.ts`.
 * PNGs are written at deviceScaleFactor 1 (CSS = PNG pixels) to match the
 * built-in project default.
 * Usage: node ./scripts/generate-example-baselines.mjs
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = path.join(packageRoot, "tests/examples-snapshots/examples");

/** CSS sizes — keep in sync with EXAMPLE_SIZES. */
const CSS = {
  card: { width: 320, height: 168 },
  gallery: { width: 280, height: 120 },
  galleryCompact: { width: 280, height: 88 },
  interactionsIdle: { width: 300, height: 100 },
  interactionsOpen: { width: 300, height: 168 },
  modes: { width: 260, height: 100 },
  modesCompact: { width: 260, height: 72 },
  filterChip: { width: 240, height: 64 },
  aiReply: { width: 320, height: 120 },
  formField: { width: 280, height: 96 },
};
const SCALE = 1;
const BANNER_H = 28;
const PAD = 12;

function px(n) {
  return Math.round(n * SCALE);
}

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

function writeCssPng(rel, cssW, cssH, paintCss) {
  const width = px(cssW);
  const height = px(cssH);
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, 248, 249, 250);
  paintCss((x, y, w, h, r, g, b) => {
    fillRect(png, px(x), px(y), px(w), px(h), r, g, b);
  });
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(
    "wrote",
    path.relative(packageRoot, out),
    `${width}×${height} (CSS ${cssW}×${cssH} @${SCALE}x)`,
  );
}

function paintCard(fill, originY, headerRgb) {
  const [hr, hg, hb] = headerRgb;
  const cardW = CSS.card.width - PAD * 2;
  const cardH = CSS.card.height - originY - PAD;
  fill(PAD, originY, cardW, cardH, 255, 255, 255);
  fill(PAD, originY, cardW, 36, hr, hg, hb);
  fill(PAD + 14, originY + 48, 180, 10, 55, 63, 80);
  fill(PAD + 14, originY + 68, 220, 8, 120, 130, 145);
}

writeCssPng("card/match.png", CSS.card.width, CSS.card.height, (fill) => {
  paintCard(fill, PAD, [30, 64, 120]);
});

writeCssPng("card/drift.png", CSS.card.width, CSS.card.height, (fill) => {
  fill(0, 0, CSS.card.width, BANNER_H, 122, 46, 46);
  paintCard(fill, BANNER_H + PAD, [30, 64, 120]);
});

function paintGallery(fill, { w, h, accent, compact }) {
  const cardH = h - PAD * 2;
  fill(PAD, PAD, w - PAD * 2, cardH, 255, 255, 255);
  fill(PAD, PAD, 8, cardH, ...accent);
  fill(
    PAD + 24,
    PAD + (compact ? 22 : 34),
    compact ? 140 : 160,
    compact ? 12 : 14,
    40,
    50,
    60,
  );
}

writeCssPng(
  "gallery/default.png",
  CSS.gallery.width,
  CSS.gallery.height,
  (fill) =>
    paintGallery(fill, {
      w: CSS.gallery.width,
      h: CSS.gallery.height,
      accent: [46, 125, 50],
      compact: false,
    }),
);
writeCssPng(
  "gallery/compact.png",
  CSS.galleryCompact.width,
  CSS.galleryCompact.height,
  (fill) =>
    paintGallery(fill, {
      w: CSS.galleryCompact.width,
      h: CSS.galleryCompact.height,
      accent: [46, 125, 50],
      compact: true,
    }),
);
writeCssPng(
  "gallery/accent.png",
  CSS.gallery.width,
  CSS.gallery.height,
  (fill) =>
    paintGallery(fill, {
      w: CSS.gallery.width,
      h: CSS.gallery.height,
      accent: [180, 90, 40],
      compact: false,
    }),
);

writeCssPng(
  "interactions/idle.png",
  CSS.interactionsIdle.width,
  CSS.interactionsIdle.height,
  (fill) => {
    fill(PAD, 28, 120, 40, 30, 64, 120);
  },
);
writeCssPng(
  "interactions/opened.png",
  CSS.interactionsOpen.width,
  CSS.interactionsOpen.height,
  (fill) => {
    fill(PAD, 28, 120, 40, 30, 64, 120);
    fill(PAD, 80, 260, 64, 255, 255, 255);
    fill(PAD + 16, 96, 140, 10, 80, 90, 100);
  },
);

writeCssPng("modes/default.png", CSS.modes.width, CSS.modes.height, (fill) => {
  fill(PAD, PAD, CSS.modes.width - PAD * 2, 76, 255, 255, 255);
  fill(PAD + 16, 36, 120, 14, 40, 50, 60);
});
writeCssPng(
  "modes/compact.png",
  CSS.modesCompact.width,
  CSS.modesCompact.height,
  (fill) => {
    fill(PAD, PAD, CSS.modesCompact.width - PAD * 2, 48, 255, 255, 255);
    fill(PAD + 16, 28, 100, 12, 40, 50, 60);
  },
);

writeCssPng(
  "filter-chip/default.png",
  CSS.filterChip.width,
  CSS.filterChip.height,
  (fill) => {
    fill(PAD, 16, 108, 32, 230, 240, 255);
    fill(PAD + 14, 26, 60, 10, 30, 64, 120);
  },
);
writeCssPng(
  "ai-reply/default.png",
  CSS.aiReply.width,
  CSS.aiReply.height,
  (fill) => {
    fill(PAD, PAD, CSS.aiReply.width - PAD * 2, 96, 245, 247, 250);
    fill(PAD + 16, 36, 200, 12, 60, 70, 85);
    fill(PAD + 16, 60, 160, 10, 120, 130, 145);
  },
);
writeCssPng(
  "form-field/default.png",
  CSS.formField.width,
  CSS.formField.height,
  (fill) => {
    fill(PAD, 40, CSS.formField.width - PAD * 2, 36, 255, 255, 255);
    fill(PAD, 74, CSS.formField.width - PAD * 2, 2, 30, 64, 120);
    fill(PAD + 12, 52, 100, 10, 120, 130, 145);
  },
);
