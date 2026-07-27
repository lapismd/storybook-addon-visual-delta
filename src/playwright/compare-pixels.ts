import { readFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import {
  PLAYWRIGHT_PASS_THRESHOLD_PERCENT,
  VISUAL_DIFF_HISTOGRAM_BINS,
  type VisualDiffChangeBounds,
} from "../visual-diff-sidecar.js";

export type PixelCompareResult = {
  imageWidth: number;
  imageHeight: number;
  capturedWidth: number;
  capturedHeight: number;
  dimensionMismatch: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  passThresholdPercent: number;
  passed: boolean;
  changeBounds: VisualDiffChangeBounds | null;
  diffHistogram: number[];
  /** Actual PNG fitted to baseline dimensions (for panel / sidecar artifacts). */
  actualPng: Buffer;
  /** Pixelmatch heatmap PNG (same size as baseline). */
  diffPng: Buffer;
};

function isDiffPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 200) return false;
  const isRed = r > 200 && g < 80 && b < 80;
  const isGreen = g > 200 && r < 80 && b < 80;
  return isRed || isGreen;
}

function buildDiffHistogram(
  baselineData: Uint8Array,
  actualData: Uint8Array,
  diffData: Uint8Array,
  width: number,
  height: number,
  bins = VISUAL_DIFF_HISTOGRAM_BINS,
): number[] {
  const counts = new Array<number>(bins).fill(0);
  const binSize = 256 / bins;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        !isDiffPixel(
          diffData[i] ?? 0,
          diffData[i + 1] ?? 0,
          diffData[i + 2] ?? 0,
          diffData[i + 3] ?? 0,
        )
      ) {
        continue;
      }
      const dr = Math.abs((actualData[i] ?? 0) - (baselineData[i] ?? 0));
      const dg = Math.abs(
        (actualData[i + 1] ?? 0) - (baselineData[i + 1] ?? 0),
      );
      const db = Math.abs(
        (actualData[i + 2] ?? 0) - (baselineData[i + 2] ?? 0),
      );
      const delta = Math.max(dr, dg, db);
      const bin = Math.min(bins - 1, Math.floor(delta / binSize));
      counts[bin] += 1;
    }
  }
  return counts;
}

function changeBoundsFromDiff(
  diffData: Uint8Array,
  width: number,
  height: number,
): VisualDiffChangeBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        !isDiffPixel(
          diffData[i] ?? 0,
          diffData[i + 1] ?? 0,
          diffData[i + 2] ?? 0,
          diffData[i + 3] ?? 0,
        )
      ) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pad = Math.max(8, Math.round(Math.min(width, height) * 0.02));
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(width - 1, maxX + pad);
  const bottom = Math.min(height - 1, maxY + pad);
  return {
    x,
    y,
    width: right - x + 1,
    height: bottom - y + 1,
  };
}

/** Fit `src` into `width`×`height` by center-crop / pad (no stretch). */
function fitRgba(src: PNG, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const ox = Math.floor((width - src.width) / 2);
  const oy = Math.floor((height - src.height) / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - ox;
      const sy = y - oy;
      const di = (y * width + x) * 4;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
        continue;
      }
      const si = (sy * src.width + sx) * 4;
      out[di] = src.data[si] ?? 0;
      out[di + 1] = src.data[si + 1] ?? 0;
      out[di + 2] = src.data[si + 2] ?? 0;
      out[di + 3] = src.data[si + 3] ?? 0;
    }
  }
  return out;
}

/**
 * Compare a baseline PNG on disk to an actual PNG buffer (from Playwright screenshot).
 * Threshold matches Playwright `maxDiffPixelRatio: 0.01` (1% of pixels) by default.
 */
export function compareBaselineToActualPng(
  baselinePath: string,
  actualPng: Buffer,
  options:
    | number
    | {
        passThresholdPercent?: number;
        diffThreshold?: number;
        includeAntiAliasing?: boolean;
      } = PLAYWRIGHT_PASS_THRESHOLD_PERCENT,
): PixelCompareResult {
  const passThresholdPercent =
    typeof options === "number"
      ? options
      : (options.passThresholdPercent ?? PLAYWRIGHT_PASS_THRESHOLD_PERCENT);
  const diffThreshold =
    typeof options === "number" ? 0.2 : (options.diffThreshold ?? 0.2);
  const includeAntiAliasing =
    typeof options === "number"
      ? false
      : (options.includeAntiAliasing ?? false);
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const actual = PNG.sync.read(actualPng);
  const width = baseline.width;
  const height = baseline.height;
  const dimensionMismatch = actual.width !== width || actual.height !== height;
  const baselineData = new Uint8ClampedArray(baseline.data);
  const actualData = new Uint8ClampedArray(
    actual.width === width && actual.height === height
      ? actual.data
      : fitRgba(actual, width, height),
  );
  const diffData = new Uint8ClampedArray(width * height * 4);
  const diffPixels = pixelmatch(
    actualData,
    baselineData,
    diffData,
    width,
    height,
    {
      threshold: diffThreshold,
      includeAA: includeAntiAliasing,
      alpha: 0.1,
      diffColor: [255, 0, 0],
      diffColorAlt: [0, 255, 0],
    },
  );
  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

  const fittedActual = new PNG({ width, height });
  fittedActual.data = Buffer.from(actualData);
  const diffImage = new PNG({ width, height });
  diffImage.data = Buffer.from(diffData);

  return {
    imageWidth: width,
    imageHeight: height,
    capturedWidth: actual.width,
    capturedHeight: actual.height,
    dimensionMismatch,
    diffPixels,
    totalPixels,
    diffPercent,
    passThresholdPercent,
    passed: !dimensionMismatch && diffPercent <= passThresholdPercent,
    changeBounds: changeBoundsFromDiff(
      new Uint8Array(diffData.buffer, diffData.byteOffset, diffData.byteLength),
      width,
      height,
    ),
    diffHistogram: buildDiffHistogram(
      new Uint8Array(
        baselineData.buffer,
        baselineData.byteOffset,
        baselineData.byteLength,
      ),
      new Uint8Array(
        actualData.buffer,
        actualData.byteOffset,
        actualData.byteLength,
      ),
      new Uint8Array(diffData.buffer, diffData.byteOffset, diffData.byteLength),
      width,
      height,
    ),
    actualPng: PNG.sync.write(fittedActual),
    diffPng: PNG.sync.write(diffImage),
  };
}
