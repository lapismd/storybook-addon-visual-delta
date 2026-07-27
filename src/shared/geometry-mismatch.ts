import type { BaselineGeometryMismatch } from "../constants.js";

type Size = { width: number; height: number };

const GEOMETRY_TOLERANCE_CSS_PX = 1;

/** Detect legacy/portal captures whose bitmap already contains the viewport. */
export function isViewportSizedBaseline(
  baselineCss: Size,
  captureViewport: Size,
): boolean {
  return (
    baselineCss.width > 0 &&
    baselineCss.height > 0 &&
    Math.abs(baselineCss.width - captureViewport.width) <=
      GEOMETRY_TOLERANCE_CSS_PX &&
    Math.abs(baselineCss.height - captureViewport.height) <=
      GEOMETRY_TOLERANCE_CSS_PX
  );
}

function roundedSize(size: Size): Size {
  return {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
}

/**
 * Report component-capture bounds that no longer match their baseline.
 * Full-viewport captures intentionally compare the viewport rather than the
 * first story subject, so they never produce a component geometry warning.
 */
export function baselineGeometryMismatch(
  baselineCss: Size,
  liveCss: Size,
  captureViewport: Size,
  cropToViewport: boolean,
): BaselineGeometryMismatch | null {
  if (cropToViewport || isViewportSizedBaseline(baselineCss, captureViewport)) {
    return null;
  }
  if (
    baselineCss.width < 1 ||
    baselineCss.height < 1 ||
    liveCss.width < 1 ||
    liveCss.height < 1
  ) {
    return null;
  }
  if (
    Math.abs(baselineCss.width - liveCss.width) <= GEOMETRY_TOLERANCE_CSS_PX &&
    Math.abs(baselineCss.height - liveCss.height) <= GEOMETRY_TOLERANCE_CSS_PX
  ) {
    return null;
  }
  return {
    baselineCss: roundedSize(baselineCss),
    liveCss: roundedSize(liveCss),
    captureViewport: roundedSize(captureViewport),
  };
}
