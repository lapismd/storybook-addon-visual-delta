import pixelmatch from "pixelmatch";
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PASS_THRESHOLD_PERCENT,
} from "../constants.js";
import type { DiffResultData } from "../types.js";
import { fitImageData, loadImage, maskTransparentRegions } from "./capture.js";
import { buildDiffHistogram, buildFocusAssets } from "./diff-assets.js";

export type LoadedComparisonImage = Awaited<ReturnType<typeof loadImage>>;

export type ImageComparisonOptions = {
  pixelThreshold?: number;
  includeAntiAliasing?: boolean;
  passThresholdPercent?: number;
  deviceScaleFactor?: number;
  cssWidth?: number;
  cssHeight?: number;
  captureViewport?: { width: number; height: number };
  observedCaptureViewport?: { width: number; height: number };
  sizeNote?: string;
};

/**
 * Compare two decoded images using the same browser pixelmatch presentation as
 * Live Diff. This is side-effect free: callers decide whether a result should
 * update Storybook visual status.
 */
export function compareLoadedImages(
  baseline: LoadedComparisonImage,
  actual: LoadedComparisonImage,
  options: ImageComparisonOptions = {},
): DiffResultData {
  const width = baseline.width;
  const height = baseline.height;
  const baselineData = baseline.imageData.data;
  const actualData = fitImageData(actual.imageData, width, height);
  const { baselineForDiff, actualForDiff, ignore } = maskTransparentRegions(
    baselineData,
    actualData,
    width,
    height,
  );

  const actualMaskedCanvas = document.createElement("canvas");
  actualMaskedCanvas.width = width;
  actualMaskedCanvas.height = height;
  const actualMaskedCtx = actualMaskedCanvas.getContext("2d");
  if (!actualMaskedCtx) throw new Error("Unable to get canvas context");
  const actualMaskedImageData = actualMaskedCtx.createImageData(width, height);
  actualMaskedImageData.data.set(actualData);
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (!ignore[pixel]) continue;
    const index = pixel * 4;
    actualMaskedImageData.data[index] = 0;
    actualMaskedImageData.data[index + 1] = 0;
    actualMaskedImageData.data[index + 2] = 0;
    actualMaskedImageData.data[index + 3] = 0;
  }
  actualMaskedCtx.putImageData(actualMaskedImageData, 0, 0);

  const diffData = new Uint8ClampedArray(width * height * 4);
  const diffPixels = pixelmatch(
    actualForDiff,
    baselineForDiff,
    diffData,
    width,
    height,
    {
      threshold: options.pixelThreshold ?? DEFAULT_DIFF_THRESHOLD,
      includeAA: options.includeAntiAliasing ?? false,
      alpha: 0.1,
      diffColor: [255, 0, 0],
      diffColorAlt: [0, 255, 0],
    },
  );
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffContext = diffCanvas.getContext("2d");
  if (!diffContext) throw new Error("Unable to get canvas context");
  const diffImageData = diffContext.createImageData(width, height);
  diffImageData.data.set(diffData);
  diffContext.putImageData(diffImageData, 0, 0);

  const { focusDataUrl, changeBounds } = buildFocusAssets(
    actualMaskedImageData.data,
    diffData,
    width,
    height,
  );
  const diffHistogram = buildDiffHistogram(
    baselineForDiff,
    actualForDiff,
    diffData,
    width,
    height,
  );
  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
  const passThresholdPercent =
    options.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
  const deviceScaleFactor = options.deviceScaleFactor ?? 3;

  return {
    actualImage: actualMaskedCanvas.toDataURL("image/png"),
    diffImage: diffCanvas.toDataURL("image/png"),
    baselineImage: baseline.dataUrl,
    focusImage: focusDataUrl,
    changeBounds,
    imageWidth: width,
    imageHeight: height,
    cssWidth: options.cssWidth ?? width / deviceScaleFactor,
    cssHeight: options.cssHeight ?? height / deviceScaleFactor,
    deviceScaleFactor,
    captureViewport: options.captureViewport,
    observedCaptureViewport: options.observedCaptureViewport,
    capturedBitmap: { width: actual.width, height: actual.height },
    diffPixels,
    totalPixels,
    diffPercent,
    passThresholdPercent,
    passed: diffPercent < passThresholdPercent,
    sizeNote: options.sizeNote,
    diffHistogram,
  };
}

export async function compareImageSources(
  baselineSource: string,
  actualSource: string,
  options: ImageComparisonOptions = {},
): Promise<DiffResultData> {
  const [baseline, actual] = await Promise.all([
    loadImage(baselineSource),
    loadImage(actualSource),
  ]);
  return compareLoadedImages(baseline, actual, options);
}

export type ImageComparisonRunner = typeof compareImageSources;
