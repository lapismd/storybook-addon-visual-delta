import type { AlignMode, VisualDeltaImage } from "./constants.js";

export type OverlayInfo = {
  iframe: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  overlay: {
    left: number;
    top: number;
    width: number;
    height: number;
    translateX: number;
    translateY: number;
  } | null;
  image: {
    left: number;
    top: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    src: string;
  } | null;
  cropArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type ChangeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiffResultData = {
  /** Result provenance; HTML results are diagnostic-only. */
  source?: "html" | "playwright";
  baselineHash?: string;
  captureConfigHash?: string;
  operationId?: string;
  actualImage: string;
  diffImage: string;
  baselineImage: string;
  /** Dimmed actual with neon-green changed pixels (Chromatic focus). */
  focusImage: string;
  /** Bounding box of changed pixels in image space, or null if none. */
  changeBounds: ChangeBounds | null;
  imageWidth: number;
  imageHeight: number;
  /** Native CSS display size derived from bitmap pixels / device scale. */
  cssWidth?: number;
  cssHeight?: number;
  /** Device-pixel density used for this baseline/capture. */
  deviceScaleFactor?: number;
  /** CSS viewport requested for capture. */
  captureViewport?: { width: number; height: number };
  /** CSS viewport actually observed before rasterization. */
  observedCaptureViewport?: { width: number; height: number };
  /** Actual raster dimensions produced by the capture engine. */
  capturedBitmap?: { width: number; height: number };
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  passThresholdPercent: number;
  passed: boolean;
  /** Capture / baseline dimensions for diagnosing layout mismatch. */
  sizeNote?: string;
  /**
   * Counts of changed pixels by max-channel delta magnitude (0…255),
   * bucketed for the Difference distribution chart.
   */
  diffHistogram: number[];
};

export type { AlignMode, VisualDeltaImage };
