import { existsSync, readFileSync } from "node:fs";
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
