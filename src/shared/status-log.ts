/** Minimal progress shape for status streaming (mirrors VisualRunProgress). */
export type StatusLogProgress = {
  completed: number;
  total: number;
  storyId?: string;
  status?: "passed" | "failed";
};

/** Last non-empty line from a streamed log (for clipped status labels). */
export function lastMeaningfulLogLine(log: string): string {
  const lines = log.replace(/\r\n/g, "\n").split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return "";
}

/** One progress line for the status streamer / Testing Module title. */
export function visualRunProgressLogLine(progress: StatusLogProgress): string {
  if (progress.storyId) {
    const mark = progress.status === "failed" ? "✘" : "✓";
    return `${mark} ${progress.storyId} (${progress.completed}/${progress.total})`;
  }
  if (progress.total <= 0) return "Starting...";
  return `Testing... ${progress.completed}/${progress.total}`;
}

/** Append a progress line, replacing the buffer when a run is just starting. */
export function appendVisualRunLogLine(
  prev: string | null | undefined,
  progress: StatusLogProgress,
): string {
  const line = visualRunProgressLogLine(progress);
  if (!prev || (progress.completed === 0 && !progress.storyId)) return line;
  return `${prev}\n${line}`;
}

/** Compact `completed/total` for Testing Module row chips / descriptions. */
export function formatProgressFraction(
  completed: number | undefined,
  total: number | undefined,
): string | null {
  if (total == null || total <= 0) return null;
  return `${Math.max(0, completed ?? 0)}/${total}`;
}
