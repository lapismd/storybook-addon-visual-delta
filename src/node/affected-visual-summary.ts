import type { AffectedVisualSummary } from "../shared/affected-types.js";

export function allSummary(
  selection: AffectedVisualSummary["selection"],
  storyIds: string[],
  fallbackReason?: string,
  changed: string[] = [],
): AffectedVisualSummary {
  return {
    selection,
    selected: storyIds.length,
    unchanged: 0,
    total: storyIds.length,
    noChange: !fallbackReason && storyIds.length === 0,
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(changed.length ? { changedInputs: changed } : {}),
    storyIds,
  };
}
