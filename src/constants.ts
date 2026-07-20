export const ADDON_ID = "visual-delta";
export const PANEL_ID = `${ADDON_ID}/panel`;
export const TEST_PROVIDER_ID = `${ADDON_ID}/test-provider`;
export const STATUS_TYPE_ID_VISUAL = `${ADDON_ID}/visual`;
export const KEY = "visual-delta";

export const EVENTS = {
  INIT_IMAGE: `${ADDON_ID}/init-image`,
  SELECT_IMAGE: `${ADDON_ID}/select-image`,
  UPDATE_OVERLAY_STYLE: `${ADDON_ID}/update-overlay-style`,
  RESET_OVERLAY: `${ADDON_ID}/reset-overlay`,
  REQUEST_OVERLAY_INFO: `${ADDON_ID}/request-overlay-info`,
  OVERLAY_INFO: `${ADDON_ID}/overlay-info`,
  HIDE_OVERLAY: `${ADDON_ID}/hide-overlay`,
  SHOW_OVERLAY: `${ADDON_ID}/show-overlay`,
  OVERLAY_HIDDEN: `${ADDON_ID}/overlay-hidden`,
} as const;

export type AlignMode = "viewport" | "canvas";

/**
 * Where the baseline sits relative to the live story:
 * - left/right/above/below — shared 50:50 scrollable split
 * - center — stacked ghost overlay (legacy "over")
 *
 * Legacy values `"beside"` → `"right"`, `"over"` → `"center"`.
 */
export type PlacementMode = "left" | "right" | "above" | "below" | "center";

export const PLACEMENT_MODES: readonly PlacementMode[] = [
  "left",
  "right",
  "above",
  "below",
  "center",
] as const;

export function isPlacementMode(value: unknown): value is PlacementMode {
  return (
    typeof value === "string" &&
    (PLACEMENT_MODES as readonly string[]).includes(value)
  );
}

/** Map legacy + current placement strings to a PlacementMode. */
export function normalizePlacement(value: unknown): PlacementMode {
  if (value === "beside") return "right";
  if (value === "over") return "center";
  if (isPlacementMode(value)) return value;
  return DEFAULT_PLACEMENT;
}

export function isSplitPlacement(placement: PlacementMode): boolean {
  return placement !== "center";
}

export type VisualDeltaImage = {
  src: string;
  anchor?: string;
  offsetX: number;
  offsetY: number;
  align: AlignMode;
  placement: PlacementMode;
};

export type VisualDeltaParams = {
  images?:
    | string
    | Array<string | (Partial<VisualDeltaImage> & { src: string })>;
  anchor?: string;
  offsetX?: number;
  offsetY?: number;
  align?: AlignMode;
  /** Accepts legacy `"beside"` / `"over"` (normalized at runtime). */
  placement?: PlacementMode | "beside" | "over";
  opacity?: number;
  colorInversion?: boolean;
  passThresholdPercent?: number;
};

export const DEFAULT_PASS_THRESHOLD_PERCENT = 0.1;
export const DEFAULT_PLACEMENT: PlacementMode = "right";
/** @deprecated Kept for any external imports; split layout no longer uses a gap. */
export const BESIDE_GAP_PX = 24;

/**
 * Must match `scripts/ui-generator/visual/capture-config.ts`.
 * Baseline PNGs are device pixels; overlay/diff display at CSS size
 * (naturalWidth / this factor).
 */
export const VISUAL_DEVICE_SCALE_FACTOR = 3;

/** Storybook-dev middleware that regenerates on-disk baselines. */
export const VISUAL_DELTA_UPDATE_PATH = "/__visual-delta/update-baseline";
/** Storybook-dev middleware that runs the Playwright visual suite. */
export const VISUAL_DELTA_RUN_PATH = "/__visual-delta/run-tests";
/** Storybook-dev middleware that cancels an in-flight visual run. */
export const VISUAL_DELTA_CANCEL_PATH = "/__visual-delta/cancel-tests";
