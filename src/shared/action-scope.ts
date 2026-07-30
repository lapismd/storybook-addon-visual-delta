export type VisualActionContext = "story" | "component" | "global";

/** Preserve the invoked sidebar node type even when a component has one leaf. */
export function visualActionContextForSidebarEntry(
  entryType: string | undefined,
): Exclude<VisualActionContext, "global"> | undefined {
  if (!entryType) return undefined;
  return entryType === "story" ? "story" : "component";
}

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
  /** Run Diff Accept of last-run passes when project auto-accept is enabled. */
  acceptPasses?: (results: Result | undefined) => Promise<void>;
}): Promise<Result | undefined> {
  await actions.writeBaselines?.();
  const results = await actions.runVisualTests?.();
  await actions.updateStatus?.(results);
  await actions.acceptPasses?.(results);
  return results;
}

/**
 * Reuse prior evidence only when it covers the complete frozen invocation
 * scope. A partial prior run must not silently update just the stories for
 * which stale manager state happens to remain.
 */
export function resultsForFrozenVisualScope<Result extends { storyId: string }>(
  storyIds: readonly string[],
  results: readonly Result[],
): Result[] | undefined {
  const byStoryId = new Map(results.map((result) => [result.storyId, result]));
  const frozenIds = uniqueStoryIds(storyIds);
  if (frozenIds.some((storyId) => !byStoryId.has(storyId))) return undefined;
  return frozenIds.map((storyId) => byStoryId.get(storyId)!);
}
