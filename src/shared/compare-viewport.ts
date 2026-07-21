import {
  VISUAL_COMPARE_PANE_PAD_PX,
  VISUAL_DEVICE_SCALE_FACTOR,
} from "../constants.js";

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
  padPx: number = VISUAL_COMPARE_PANE_PAD_PX,
): BaselineCompareSizes | null {
  if (naturalWidth < 1 || naturalHeight < 1) return null;
  const content = {
    width: naturalWidth / VISUAL_DEVICE_SCALE_FACTOR,
    height: naturalHeight / VISUAL_DEVICE_SCALE_FACTOR,
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
