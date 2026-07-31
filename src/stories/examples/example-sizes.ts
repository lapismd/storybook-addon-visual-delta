/**
 * Example stage sizes in CSS pixels. Baseline PNGs are captured at
 * `VISUAL_DEVICE_SCALE_FACTOR` (3×): PNG width = CSS width × 3.
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

/** Example baseline URL (PNG is 3× CSS; default deviceScaleFactor applies). */
export function exampleBaseline(src: string): string {
  return src;
}
