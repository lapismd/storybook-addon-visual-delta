import { VISUAL_DEVICE_SCALE_FACTOR } from "../constants.js";

export type CompareSize = {
  width: number;
  height: number;
};

export type BaselineCompareSizes = {
  /** Baseline PNG displayed at CSS pixels (natural / device scale). */
  content: CompareSize;
  /** Equal pane viewport: content plus pad on each side. */
  viewport: CompareSize;
};

/**
 * Derive equal compare-pane sizes from a device-scale baseline PNG.
 */
export function baselineCompareSizesFromNatural(
  naturalWidth: number,
  naturalHeight: number,
  padPx: number = 0,
  deviceScaleFactor: number = VISUAL_DEVICE_SCALE_FACTOR,
): BaselineCompareSizes | null {
  if (naturalWidth < 1 || naturalHeight < 1) return null;
  const scale =
    Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0
      ? deviceScaleFactor
      : VISUAL_DEVICE_SCALE_FACTOR;
  const content = {
    width: naturalWidth / scale,
    height: naturalHeight / scale,
  };
  const pad = Math.max(0, padPx) * 2;
  return {
    content,
    viewport: {
      width: content.width + pad,
      height: content.height + pad,
    },
  };
}

/**
 * Shared pane scroll extent: max of either side's content, floored by an
 * optional minimum (usually baseline CSS content size).
 */
export function sharedScrollExtentSize(
  a: CompareSize,
  b: CompareSize,
  min?: Partial<CompareSize>,
): CompareSize {
  return {
    width: Math.max(a.width, b.width, min?.width ?? 0),
    height: Math.max(a.height, b.height, min?.height ?? 0),
  };
}
