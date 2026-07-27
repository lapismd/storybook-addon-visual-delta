export type VisualActionContext = "story" | "component" | "global";

function uniqueStoryIds(storyIds: readonly string[]): string[] {
  return [
    ...new Set(storyIds.map((storyId) => storyId.trim()).filter(Boolean)),
  ];
}

/**
 * Resolve one exact action scope. The returned array is a detached snapshot:
 * later sidebar/filter changes cannot alter an in-progress workflow.
 */
export function resolveVisualActionStoryIds(options: {
  context: VisualActionContext;
  contextStoryIds?: readonly string[];
  visibleStoryIds?: readonly string[];
  runnableStoryIds?: readonly string[];
  affectedStoryIds?: readonly string[];
  affectedOnly?: boolean;
}): string[] {
  const base =
    options.context === "global"
      ? uniqueStoryIds(options.visibleStoryIds ?? [])
      : uniqueStoryIds(options.contextStoryIds ?? []);
  const runnable = options.runnableStoryIds
    ? new Set(uniqueStoryIds(options.runnableStoryIds))
    : null;
  const affected =
    options.context === "global" && options.affectedOnly
      ? new Set(uniqueStoryIds(options.affectedStoryIds ?? []))
      : null;

  return base.filter(
    (storyId) =>
      (!runnable || runnable.has(storyId)) &&
      (!affected || affected.has(storyId)),
  );
}

/** Execute enabled Testing Module actions in the required workflow order. */
export async function executeVisualActionSequence<Result>(actions: {
  writeBaselines?: () => Promise<void>;
  runVisualTests?: () => Promise<Result>;
  updateStatus?: (results: Result | undefined) => Promise<void>;
}): Promise<Result | undefined> {
  await actions.writeBaselines?.();
  const results = await actions.runVisualTests?.();
  await actions.updateStatus?.(results);
  return results;
}
