import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

/**
 * Keep `storybook-static/index.json` tags in sync after CSF skip-visual patches.
 * Create/update with `--skip-build` otherwise still runs Playwright against a
 * stale index that filters the story out ("No tests found").
 */
export function syncStaticIndexSkipVisual(
  packageRoot: string,
  storyIds: readonly string[],
  skip: boolean,
): { updated: string[] } {
  const filePath = path.join(packageRoot, "storybook-static", "index.json");
  if (!existsSync(filePath) || storyIds.length === 0) {
    return { updated: [] };
  }
  let parsed: { entries?: Record<string, StoryIndexEntry> };
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
  } catch {
    return { updated: [] };
  }
  if (!parsed.entries) return { updated: [] };

  const updated: string[] = [];
  for (const id of storyIds) {
    const entry = parsed.entries[id];
    if (!entry) continue;
    const tags = [...(entry.tags ?? [])];
    const has = tags.includes("skip-visual");
    if (skip === has) continue;
    entry.tags = skip
      ? [...tags, "skip-visual"]
      : tags.filter((tag) => tag !== "skip-visual");
    updated.push(id);
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
