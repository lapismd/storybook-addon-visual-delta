/** Shared schema for per-screenshot visual diff sidecars (Playwright + Storybook). */

export type VisualDiffSidecarStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut";

export type VisualDiffChangeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualDiffSidecar = {
  version: 1;
  storyId: string;
  title?: string;
  /** Named Storybook globals mode; omitted for the Default capture. */
  mode?: string;
  /** Relative path passed to `toHaveScreenshot` (no project/platform suffix). */
  snapshotRel: string;
  status: VisualDiffSidecarStatus;
  error?: string;
  generatedAt: string;
  tool: "playwright";
  imageWidth?: number;
  imageHeight?: number;
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
   * Suite default is 1 (1%).
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

export const VISUAL_DIFF_HISTOGRAM_BINS = 32;

/** Playwright `maxDiffPixelRatio: 0.01` → 1% of pixels. */
export const PLAYWRIGHT_PASS_THRESHOLD_PERCENT = 1;
