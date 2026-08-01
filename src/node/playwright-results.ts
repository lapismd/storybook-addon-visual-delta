import type { VisualDeltaHostOptions } from "./options.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import { isVisualDeltaBrowser } from "../shared/environments.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import { resolveBaselinePathMode, resolveSnapshotDir } from "./options.js";
import { loadSidecarForStoryId } from "./visual-sidecars.js";

export type PlaywrightListResult = {
  index: number;
  storyId: string;
  status: "passed" | "failed";
  browser: VisualDeltaBrowser;
  platform: string;
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
    /([✓✔✘×xX])\s+(\d+)\s+\[([^\]]+)\].*?›\s+(\S+--\S+?)(?:\s+\([\d.]+\s*[mun]?s\))?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const mark = match[1] ?? "";
    const index = Number(match[2]);
    const browser = match[3]?.trim();
    const storyId = match[4]?.trim();
    if (!storyId || !Number.isFinite(index) || !isVisualDeltaBrowser(browser)) {
      continue;
    }
    const failed = mark === "✘" || mark === "×" || mark === "x" || mark === "X";
    out.push({
      index,
      storyId,
      status: failed ? "failed" : "passed",
      browser,
      platform: process.platform,
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
    browser?: VisualDeltaBrowser;
    platform?: string;
    environment?: { browser: VisualDeltaBrowser; platform: string };
    policyStatus?: string;
    sidecar?: unknown;
  }>;
}): string[] {
  const hostOptions = options.hostOptions ?? {};
  const browsers = readVisualDeltaProjectConfig(options.root).browsers;
  const snapshotDir = resolveSnapshotDir(hostOptions, options.root);
  const mode = resolveBaselinePathMode(hostOptions);
  const successful = new Set<string>();
  const resultsByStory = new Map<string, typeof options.results>();

  for (const result of options.results) {
    const storyId = primaryStoryId(result.storyId);
    resultsByStory.set(storyId, [
      ...(resultsByStory.get(storyId) ?? []),
      result,
    ]);
  }
  for (const [storyId, results] of resultsByStory) {
    const allPassed = browsers.every((browser) => {
      const result = results.find(
        (candidate) =>
          (candidate.environment?.browser ?? candidate.browser ?? "chromium") ===
          browser,
      );
      if (
        !result ||
        result.status !== "passed" ||
        result.policyStatus === "warning"
      )
        return false;
      const inlineSidecar =
        result.sidecar && typeof result.sidecar === "object"
          ? (result.sidecar as {
              passed?: boolean;
              policyStatus?: string;
            })
          : undefined;
      const sidecar =
        inlineSidecar ??
        loadSidecarForStoryId(
          storyId,
          options.root,
          snapshotDir,
          mode,
          browser,
          result.environment?.platform ?? result.platform ?? process.platform,
        );
      return sidecar?.policyStatus !== "warning" && sidecar?.passed !== false;
    });
    if (allPassed) successful.add(storyId);
  }

  return [...successful];
}
