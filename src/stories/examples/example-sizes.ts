import type { VisualDeltaParams } from "../../constants.js";

/**
 * Example stage sizes in CSS pixels. Baseline PNGs match these sizes at the
 * built-in `deviceScaleFactor` of 1 (PNG width = CSS width).
 * Keep `#storybook-root > *` (ExampleStage) at these CSS sizes so geometry matches.
 */
export const EXAMPLE_SIZES = {
  card: { width: 320, height: 168 },
  gallery: { width: 280, height: 120 },
  galleryCompact: { width: 280, height: 88 },
  interactionsIdle: { width: 300, height: 100 },
  interactionsOpen: { width: 300, height: 168 },
  modes: { width: 260, height: 100 },
  modesCompact: { width: 260, height: 72 },
  filterChip: { width: 240, height: 64 },
  aiReply: { width: 320, height: 120 },
  formField: { width: 280, height: 96 },
  missing: { width: 400, height: 120 },
} as const;

/** Example baseline URL (PNG is 1× CSS; built-in deviceScaleFactor applies). */
export function exampleBaseline(src: string): string {
  return src;
}

/**
 * Component-sized Example baselines use Story canvas alignment so the panel
 * does not advise switching away from the default Capture viewport mode.
 */
export function exampleVisualDelta(
  params: Omit<VisualDeltaParams, "align" | "deviceScaleFactor"> & {
    deviceScaleFactor?: number;
  } = {},
): VisualDeltaParams {
  return {
    // Package Storybook may load the host repo’s `.visual-delta/config.json`
    // (often deviceScaleFactor 3). Example PNGs are authored at 1× CSS size.
    deviceScaleFactor: 1,
    align: "canvas",
    ...params,
  };
}
