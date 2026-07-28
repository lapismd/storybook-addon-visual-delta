import type { VisualDeltaChangeSetMutation } from "./change-sets.js";

export const VISUAL_DELTA_CHANGES_EVENT = "visual-delta-changes-updated";

export function announceVisualDeltaChanges(
  mutation: VisualDeltaChangeSetMutation | undefined,
): void {
  if (!mutation?.changeSetId || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<VisualDeltaChangeSetMutation>(VISUAL_DELTA_CHANGES_EVENT, {
      detail: mutation,
    }),
  );
}

export function parseVisualDeltaChangeMarker(
  log: string,
): VisualDeltaChangeSetMutation | undefined {
  const match = log.match(/^\[visual-delta-change (.+)\]$/m);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as VisualDeltaChangeSetMutation;
  } catch {
    return undefined;
  }
}
