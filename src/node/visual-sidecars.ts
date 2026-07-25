import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SKIP_VISUAL_TAG,
  normalizeVisualStoryTags,
  type VisualReviewStatus,
} from "../constants.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import type { BaselinePathMode } from "./options.js";
import { snapshotFileName, type StoryIndexEntry } from "./snapshot-paths.js";

function readSidecar(filePath: string): VisualDiffSidecar | null {
  try {
    const value = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as VisualDiffSidecar;
    return value?.version === 1 && value.storyId ? value : null;
  } catch {
    return null;
  }
}

export function loadStoryIndex(
  packageRoot: string,
): Record<string, StoryIndexEntry> {
  const filePath = path.join(packageRoot, "storybook-static", "index.json");
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
    return parsed.entries ?? {};
  } catch {
    return {};
  }
}

function readStaticIndex(packageRoot: string): {
  filePath: string;
  parsed: { entries?: Record<string, StoryIndexEntry> };
} | null {
  const filePath = path.join(packageRoot, "storybook-static", "index.json");
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
    return { filePath, parsed };
  } catch {
    return null;
  }
}

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}

/**
 * Keep `storybook-static/index.json` tags in sync after CSF skip-visual patches.
 * Create/update with `--skip-build` otherwise still runs Playwright against a
 * stale index that filters the story out ("No tests found"). Skipping also
 * clears review tags to match CSF normalization.
 */
export function syncStaticIndexSkipVisual(
  packageRoot: string,
  storyIds: readonly string[],
  skip: boolean,
): { updated: string[] } {
  const index = readStaticIndex(packageRoot);
  if (!index?.parsed.entries || storyIds.length === 0) {
    return { updated: [] };
  }
  const { filePath, parsed } = index;
  const updated: string[] = [];
  for (const id of storyIds) {
    const entry = parsed.entries![id];
    if (!entry) continue;
    const prev = [...(entry.tags ?? [])];
    const next = normalizeVisualStoryTags(prev, { kind: "skip", skip });
    // Preserve non-visual tags' relative order from normalize; if skip was
    // already correct but review tags lingered, still clear them.
    if (tagsEqual(prev, next)) continue;
    entry.tags = next;
    updated.push(id);
  }
  if (updated.length) {
    writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  return { updated };
}

/**
 * Keep exactly one review tag (or none) on static-index entries after CSF
 * review / baseline / interaction patches.
 */
export function syncStaticIndexReviewStatus(
  packageRoot: string,
  updates: ReadonlyArray<{
    storyId: string;
    status: VisualReviewStatus | null;
  }>,
): { updated: string[] } {
  const index = readStaticIndex(packageRoot);
  if (!index?.parsed.entries || updates.length === 0) {
    return { updated: [] };
  }
  const { filePath, parsed } = index;
  const updated: string[] = [];
  for (const { storyId, status } of updates) {
    const entry = parsed.entries![storyId];
    if (!entry) continue;
    if ((entry.tags ?? []).includes(SKIP_VISUAL_TAG)) continue;
    const prev = [...(entry.tags ?? [])];
    const next = normalizeVisualStoryTags(
      prev,
      status == null
        ? { kind: "clear-review" }
        : { kind: "review", status },
    );
    if (tagsEqual(prev, next)) continue;
    entry.tags = next;
    updated.push(storyId);
  }
  if (updated.length) {
    writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  return { updated };
}

/** Absolute path to the committed primary baseline PNG for a story, if resolvable. */
export function baselinePngPathForStoryId(
  storyId: string,
  packageRoot: string,
  snapshotDir: string,
  mode: BaselinePathMode = "nested-import",
  project = "chromium",
  platform: NodeJS.Platform | string = "darwin",
): string | null {
  const entry = loadStoryIndex(packageRoot)[storyId];
  if (!entry) return null;
  try {
    return path.join(
      snapshotDir,
      snapshotFileName(entry, mode, project, platform),
    );
  } catch {
    return null;
  }
}

/** True when the committed primary baseline PNG exists on disk. */
export function baselinePngExistsForStoryId(
  storyId: string,
  packageRoot: string,
  snapshotDir: string,
  mode: BaselinePathMode = "nested-import",
  project = "chromium",
  platform: NodeJS.Platform | string = "darwin",
): boolean {
  const png = baselinePngPathForStoryId(
    storyId,
    packageRoot,
    snapshotDir,
    mode,
    project,
    platform,
  );
  return Boolean(png && existsSync(png));
}

export function loadSidecarForStoryId(
  storyId: string,
  packageRoot: string,
  snapshotDir: string,
  mode: BaselinePathMode = "nested-import",
  project = "chromium",
  platform: NodeJS.Platform = process.platform,
): VisualDiffSidecar | null {
  const png = baselinePngPathForStoryId(
    storyId,
    packageRoot,
    snapshotDir,
    mode,
    project,
    platform,
  );
  if (!png) return null;
  return readSidecar(png.replace(/\.png$/i, ".json"));
}
