import type { ChangeBounds } from "../types.js";

export type { ChangeBounds };

/** Neon green used for Chromatic-style spotlight highlights. */
const FOCUS_RGB: [number, number, number] = [0, 255, 120];

/**
 * Build a focus/spotlight PNG (dim unchanged, neon-green changed) and the
 * bounding box of changed pixels from a pixelmatch output buffer.
 *
 * Pixelmatch paints mismatches as `diffColor` / `diffColorAlt` at full alpha;
 * matched pixels are a faded blend — we treat near-primary red/green as changed.
 */
export function buildFocusAssets(
  actualData: Uint8ClampedArray,
  diffData: Uint8ClampedArray,
  width: number,
  height: number,
): { focusDataUrl: string; changeBounds: ChangeBounds | null } {
  const focus = new Uint8ClampedArray(width * height * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const changed = isDiffPixel(
        diffData[i],
        diffData[i + 1],
        diffData[i + 2],
        diffData[i + 3],
      );

      if (changed) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        // Spotlight: punch neon green over the actual pixel.
        focus[i] = Math.round(actualData[i] * 0.25 + FOCUS_RGB[0] * 0.75);
        focus[i + 1] = Math.round(actualData[i + 1] * 0.25 + FOCUS_RGB[1] * 0.75);
        focus[i + 2] = Math.round(actualData[i + 2] * 0.25 + FOCUS_RGB[2] * 0.75);
        focus[i + 3] = 255;
      } else {
        // Dim unchanged regions so changes read first.
        focus[i] = Math.round(actualData[i] * 0.28);
        focus[i + 1] = Math.round(actualData[i + 1] * 0.28);
        focus[i + 2] = Math.round(actualData[i + 2] * 0.28);
        focus[i + 3] = actualData[i + 3];
      }
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to get canvas context");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(focus);
  ctx.putImageData(imageData, 0, 0);

  let changeBounds: ChangeBounds | null = null;
  if (maxX >= minX && maxY >= minY) {
    const pad = Math.max(8, Math.round(Math.min(width, height) * 0.02));
    const x = Math.max(0, minX - pad);
    const y = Math.max(0, minY - pad);
    const right = Math.min(width - 1, maxX + pad);
    const bottom = Math.min(height - 1, maxY + pad);
    changeBounds = {
      x,
      y,
      width: right - x + 1,
      height: bottom - y + 1,
    };
  }

  return {
    focusDataUrl: canvas.toDataURL("image/png"),
    changeBounds,
  };
}

function isDiffPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 200) return false;
  // pixelmatch diffColor [255,0,0] / diffColorAlt [0,255,0]
  const isRed = r > 200 && g < 80 && b < 80;
  const isGreen = g > 200 && r < 80 && b < 80;
  return isRed || isGreen;
}
