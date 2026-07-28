export type BaselineAvailability = "unknown" | "present" | "absent";

export type PreviewReadiness = {
  storyId: string;
  renderGeneration: number;
  storyFinished: boolean;
};

export function baselineAvailability(args: {
  currentStoryId?: string;
  preview: PreviewReadiness;
  baselineCount: number;
}): BaselineAvailability {
  const { currentStoryId, preview, baselineCount } = args;
  if (!currentStoryId || preview.storyId !== currentStoryId) return "unknown";
  if (baselineCount > 0) return "present";
  return preview.storyFinished ? "absent" : "unknown";
}

/**
 * Merge an INIT_IMAGE readiness snapshot. Generations are monotonically
 * increasing within an iframe and use a timestamp seed after a full refresh,
 * so an older HMR/remount response cannot replace the current render.
 */
export function mergeInitReadiness(
  current: PreviewReadiness,
  incoming: PreviewReadiness,
): PreviewReadiness | null {
  if (
    current.storyId === incoming.storyId &&
    incoming.renderGeneration < current.renderGeneration
  ) {
    return null;
  }
  if (
    current.storyId === incoming.storyId &&
    incoming.renderGeneration === current.renderGeneration
  ) {
    return {
      ...incoming,
      storyFinished: current.storyFinished || incoming.storyFinished,
    };
  }
  return incoming;
}

/** Apply the exact storyFinished handshake only to the active generation. */
export function mergeStoryFinished(
  current: PreviewReadiness,
  incoming: PreviewReadiness,
): PreviewReadiness | null {
  if (
    current.storyId !== incoming.storyId ||
    current.renderGeneration !== incoming.renderGeneration
  ) {
    return null;
  }
  return { ...current, storyFinished: true };
}
