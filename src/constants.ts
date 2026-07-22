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
  /** Preview → manager: named `step()` labels seen during play. */
  PLAY_STEPS: `${ADDON_ID}/play-steps`,
  /** Manager → preview: remount and park play after this step id. */
  RUN_UNTIL_STEP: `${ADDON_ID}/run-until-step`,
} as const;

export type AlignMode = "viewport" | "canvas";

/**
 * Where the baseline sits relative to the live story:
 * - left/right/above/below — equal viewports (baseline CSS + pad) with 2D scroll
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

/** Opt-in mid-play capture (sibling PNG; primary `images` stay end-of-play). */
export type VisualDeltaInteraction = {
  id: string;
  label: string;
  src: string;
};

export type VisualDeltaParams = {
  images?:
    | string
    | Array<string | (Partial<VisualDeltaImage> & { src: string })>;
  /**
   * Opted-in play-step captures. Created from the Visual Delta Interactions tab;
   * compared by Playwright in addition to the primary end-of-play baseline.
   */
  interactions?: VisualDeltaInteraction[];
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

/**
 * Must match `scripts/ui-generator/visual/capture-config.ts`.
 * Playwright CSS viewport used when capturing baselines — live Diff forces
 * the preview iframe to this size before subject capture so wrapping matches.
 */
export const VISUAL_VIEWPORT = { width: 1280, height: 900 } as const;

/**
 * Padding (each side) added to baseline CSS size when sizing equal compare
 * panes in the overlay split.
 */
export const VISUAL_COMPARE_PANE_PAD_PX = 16;

/** Storybook-dev middleware that regenerates on-disk baselines. */
export const VISUAL_DELTA_UPDATE_PATH = "/__visual-delta/update-baseline";
/** Storybook-dev middleware that creates missing baselines only (no overwrite). */
export const VISUAL_DELTA_CREATE_PATH = "/__visual-delta/create-baseline";
/**
 * Storybook-dev middleware that creates/updates one mid-play interaction baseline
 * (`?visualCaptureUntil=<stepId>`).
 */
export const VISUAL_DELTA_CREATE_INTERACTION_PATH =
  "/__visual-delta/create-interaction-baseline";
/** Storybook-dev middleware that runs the Playwright visual suite. */
export const VISUAL_DELTA_RUN_PATH = "/__visual-delta/run-tests";
/** Storybook-dev middleware that cancels an in-flight visual run. */
export const VISUAL_DELTA_CANCEL_PATH = "/__visual-delta/cancel-tests";
/** Storybook-dev middleware that sets visual review tags on a story. */
export const VISUAL_DELTA_REVIEW_PATH = "/__visual-delta/review-status";

/** CSF tag: baseline exists but has not been human-reviewed. */
export const VISUAL_REVIEW_PENDING_TAG = "visual-pending";
/** CSF tag: baseline has been reviewed and accepted. */
export const VISUAL_REVIEW_APPROVED_TAG = "visual-approved";
/** CSF tag: baseline review failed / rejected. */
export const VISUAL_REVIEW_FAILED_TAG = "visual-failed";

export type VisualReviewStatus = "pending" | "approved" | "failed";

export const VISUAL_REVIEW_TAGS = [
  VISUAL_REVIEW_PENDING_TAG,
  VISUAL_REVIEW_APPROVED_TAG,
  VISUAL_REVIEW_FAILED_TAG,
] as const;

export function visualReviewTagFor(
  status: VisualReviewStatus,
): (typeof VISUAL_REVIEW_TAGS)[number] {
  if (status === "approved") return VISUAL_REVIEW_APPROVED_TAG;
  if (status === "failed") return VISUAL_REVIEW_FAILED_TAG;
  return VISUAL_REVIEW_PENDING_TAG;
}

export function visualReviewStatusFromTags(
  tags: readonly string[] | undefined,
): VisualReviewStatus | null {
  if (!tags?.length) return null;
  if (tags.includes(VISUAL_REVIEW_APPROVED_TAG)) return "approved";
  if (tags.includes(VISUAL_REVIEW_FAILED_TAG)) return "failed";
  if (tags.includes(VISUAL_REVIEW_PENDING_TAG)) return "pending";
  return null;
}

export function isVisualReviewStatus(
  value: unknown,
): value is VisualReviewStatus {
  return value === "pending" || value === "approved" || value === "failed";
}
