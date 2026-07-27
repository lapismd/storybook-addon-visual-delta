import type { VisualDeltaHostOptions } from "./options.js";

export type PlaywrightListResult = {
  index: number;
  storyId: string;
  status: "passed" | "failed";
};

/** Strip ANSI color codes so Playwright list-reporter lines parse reliably. */
export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[mK]/g, "");
}

/**
 * Parse Playwright list-reporter lines, for example:
 * `  ✓   1 [chromium] › … › shadcn-button--default (823ms)`
 */
export function parseListReporterProgress(
  chunk: string,
): PlaywrightListResult[] {
  const out: PlaywrightListResult[] = [];
  const text = stripAnsi(chunk);
  const re =
    /([✓✔✘×xX])\s+(\d+)\s+.*?›\s+(\S+--\S+?)(?:\s+\([\d.]+\s*[mun]?s\))?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const mark = match[1] ?? "";
    const index = Number(match[2]);
    const storyId = match[3]?.trim();
    if (!storyId || !Number.isFinite(index)) continue;
    const failed = mark === "✘" || mark === "×" || mark === "x" || mark === "X";
    out.push({
      index,
      storyId,
      status: failed ? "failed" : "passed",
    });
  }
  return out;
}

function primaryStoryId(storyId: string): string {
  return storyId.split("::interaction::")[0] ?? storyId;
}

/**
 * Return stories Playwright successfully exercised after a partial run.
 *
 * Review metadata never changes Playwright expectations, so only genuinely
 * passed results are reusable by the affected-results cache.
 */
export function successfulStoryIdsFromPlaywrightResults(options: {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  results: ReadonlyArray<{
    storyId: string;
    status: "passed" | "failed" | "skipped" | "timedOut";
  }>;
}): string[] {
  void options.root;
  void options.hostOptions;
  const successful = new Set<string>();

  for (const result of options.results) {
    const storyId = primaryStoryId(result.storyId);
    if (result.status === "passed") {
      successful.add(storyId);
      continue;
    }
  }

  return [...successful];
}
