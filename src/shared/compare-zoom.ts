import type { VisualDeltaZoomDefault } from "./config-types.js";

export const COMPARE_ZOOM_MIN = 0.25;
export const COMPARE_ZOOM_MAX = 2;
export const COMPARE_ZOOM_STEP = 0.1;

export type CompareZoomState =
  | { mode: "fit"; scale: number }
  | { mode: "custom"; scale: number };

export type CompareFitInput = {
  availableWidth: number;
  availableHeight: number;
  contentWidth: number;
  contentHeight: number;
  columns?: 1 | 2;
  columnGap?: number;
  labelHeight?: number;
};

export function clampCompareZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, value));
}

export function stepCompareZoom(value: number, direction: -1 | 1): number {
  const next = Math.round((value + direction * COMPARE_ZOOM_STEP) * 10) / 10;
  return clampCompareZoom(next);
}

export function compareZoomFromDefault(
  value: VisualDeltaZoomDefault = "fit",
): CompareZoomState {
  return value === "100%"
    ? { mode: "custom", scale: 1 }
    : { mode: "fit", scale: 1 };
}

/** True when `current` is still the unedited project/default zoom. */
export function compareZoomMatchesDefault(
  current: CompareZoomState,
  zoomDefault: VisualDeltaZoomDefault,
): boolean {
  if (zoomDefault === "100%") {
    return current.mode === "custom" && Math.abs(current.scale - 1) < 0.0001;
  }
  return current.mode === "fit";
}

/**
 * Resolve split zoom on INIT_IMAGE. The first decorator INIT often carries
 * built-in defaults (`fit`); a follow-up INIT with project config (`100%`)
 * must still adopt the project default when the user has not customized zoom.
 */
export function resolveSplitZoomOnInit(options: {
  resetDefaults: boolean;
  previousDefault: VisualDeltaZoomDefault;
  nextDefault: VisualDeltaZoomDefault;
  current: CompareZoomState;
}): CompareZoomState {
  if (
    options.resetDefaults ||
    compareZoomMatchesDefault(options.current, options.previousDefault)
  ) {
    return compareZoomFromDefault(options.nextDefault);
  }
  return options.current;
}

export function fitCompareScale(input: CompareFitInput): number {
  const columns = input.columns ?? 1;
  const gap = input.columnGap ?? 0;
  const labelHeight = input.labelHeight ?? 0;
  const availableWidth = Math.max(1, input.availableWidth - gap);
  const availableHeight = Math.max(1, input.availableHeight - labelHeight);
  const requiredWidth = Math.max(1, input.contentWidth * columns);
  const requiredHeight = Math.max(1, input.contentHeight);
  return Math.min(
    1,
    availableWidth / requiredWidth,
    availableHeight / requiredHeight,
  );
}

export function resolvedCompareZoomScale(
  state: CompareZoomState,
  fitInput: CompareFitInput,
): number {
  return state.mode === "fit"
    ? fitCompareScale(fitInput)
    : clampCompareZoom(state.scale);
}

/**
 * Fit means “shrink only when the baseline exceeds the available split slot”.
 * When the fitted scale is already 1, resolve to native `100%` so the control
 * and scroll behavior match — small subjects with spare host space should not
 * stay parked on Fit.
 */
export function resolveFitZoomState(
  state: CompareZoomState,
  fitInput: CompareFitInput,
): CompareZoomState {
  if (state.mode !== "fit") {
    return { mode: "custom", scale: clampCompareZoom(state.scale) };
  }
  const scale = fitCompareScale(fitInput);
  if (scale >= 1 - 1e-6) {
    return { mode: "custom", scale: 1 };
  }
  return { mode: "fit", scale };
}

export function compareZoomPercent(scale: number): number {
  if (!Number.isFinite(scale)) return 100;
  return Math.round(Math.min(COMPARE_ZOOM_MAX, Math.max(0.01, scale)) * 100);
}
