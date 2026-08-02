import { DEFAULT_PASS_THRESHOLD_PERCENT } from "./constants.js";

/** Shared schema for per-screenshot visual diff sidecars (Playwright + Storybook). */

export type VisualDiffSidecarStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut";

export type VisualComparisonOutcome =
  | "passed"
  | "changed-within-tolerance"
  | "mismatch"
  | "missing-baseline"
  | "error"
  | "skipped";

export type VisualComparisonPolicyStatus = "passed" | "warning" | "failed";

export type VisualDiffChangeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualDiffSidecar = {
  /**
   * v1 readers used `status` and `passed` as overlapping sources of truth.
   * v2 keeps those compatibility fields but records runner and comparison
   * outcomes independently. v3 separates browser target from capture profile.
   */
  version: 1 | 2 | 3;
  storyId: string;
  title?: string;
  /** Named Storybook globals mode; omitted for the Default capture. */
  mode?: string;
  /** Relative path passed to `toHaveScreenshot` (no project/platform suffix). */
  snapshotRel: string;
  status: VisualDiffSidecarStatus;
  /** Capture/test execution status before pixel classification (v2). */
  runnerStatus?: VisualDiffSidecarStatus;
  /** Canonical comparison classification (v2). */
  outcome?: VisualComparisonOutcome;
  /** Process-policy classification after applying warn/strict mode. */
  policyStatus?: VisualComparisonPolicyStatus;
  browser?: import("./shared/environments.js").VisualDeltaBrowser;
  target?: import("./shared/environments.js").VisualBaselineTarget;
  captureProfile?: import("./shared/capture-profile.js").VisualCaptureProfile;
  /** @deprecated Capture provenance only; never part of lookup. */
  platform?: string;
  error?: string;
  generatedAt: string;
  tool: "playwright";
  /** Stable identity for one capture/compare operation (v2). */
  operationId?: string;
  /** SHA-256 of the baseline PNG used by this comparison (v2). */
  baselineHash?: string;
  /** SHA-256 of effective capture settings used by this comparison (v2). */
  captureConfigHash?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Original actual PNG size before panel-only fit/crop (v2). */
  capturedWidth?: number;
  capturedHeight?: number;
  /** True when the original actual and baseline bitmap sizes differ (v2). */
  dimensionMismatch?: boolean;
  /** CSS viewport used by the Playwright page. */
  viewport?: { width: number; height: number };
  /** Device-pixel density used to rasterize the PNG. */
  deviceScaleFactor?: number;
  diffPixels?: number;
  totalPixels?: number;
  /** Percent of pixels that differ (0–100). */
  diffPercent?: number;
  /**
   * Pass threshold as percent of pixels (Playwright `maxDiffPixelRatio` × 100).
   * Suite default is 0.063 (0.063%).
   */
  passThresholdPercent?: number;
  passed?: boolean;
  changeBounds?: VisualDiffChangeBounds | null;
  /** Changed-pixel max-channel delta histogram (32 bins). */
  diffHistogram?: number[];
  /**
   * Paths relative to `tests/visual/storybook.spec.ts-snapshots/`, served at
   * `/visual-baselines/<rel>`. Written next to the baseline during a run.
   */
  actualRel?: string;
  diffRel?: string;
};

export function isVisualDiffSidecar(
  value: unknown,
): value is VisualDiffSidecar {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VisualDiffSidecar>;
  return (
    (candidate.version === 1 ||
      candidate.version === 2 ||
      candidate.version === 3) &&
    typeof candidate.storyId === "string" &&
    candidate.storyId.length > 0
  );
}

export const VISUAL_DIFF_HISTOGRAM_BINS = 32;

/** Built-in allowed changed-pixel percentage for Playwright comparisons. */
export const PLAYWRIGHT_PASS_THRESHOLD_PERCENT =
  DEFAULT_PASS_THRESHOLD_PERCENT;
