import { ansiRawTail, lastMeaningfulAnsiLine } from "./ansi-log.js";

/** Minimal progress shape for status streaming (mirrors VisualRunProgress). */
export type StatusLogProgress = {
  completed: number;
  total: number;
  storyId?: string;
  status?: "passed" | "failed";
};

/** Last non-empty line from a streamed log (for clipped status labels). */
export function lastMeaningfulLogLine(log: string): string {
  return lastMeaningfulAnsiLine(log).text.trim();
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

/** Append an arbitrary streamed process chunk while keeping panel state bounded. */
export function appendStatusLogChunk(
  prev: string | null | undefined,
  chunk: string,
  limit = 16_000,
): string {
  const merged = `${prev ?? ""}${chunk.replace(/\r\n/g, "\n")}`;
  return ansiRawTail(merged, limit);
}

/** Compact `completed/total` for Testing Module row chips / descriptions. */
export function formatProgressFraction(
  completed: number | undefined,
  total: number | undefined,
): string | null {
  if (total == null || total <= 0) return null;
  return `${Math.max(0, completed ?? 0)}/${total}`;
}
