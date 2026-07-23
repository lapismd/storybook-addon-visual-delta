import path from "node:path";
import type { BaselinePathMode } from "./options.js";

export type StoryIndexEntry = {
  id: string;
  type?: string;
  name?: string;
  title?: string;
  importPath?: string;
  exportName?: string;
  tags?: string[];
};

export const VISUAL_BASELINE_SUFFIX = "-chromium-darwin";

export function snapshotDirFromImportPath(importPath: string): string {
  const normalized = importPath.replace(/\\/g, "/");
  const stripped = normalized
    .replace(/^\.\//, "")
    .replace(/^src\/shared\//, "")
    .replace(/^src\/apps\//, "apps/")
    .replace(/^packages\/workspace\/src\/lib\//, "workspace/")
    .replace(/^packages\/tasks\/src\//, "tasks/");
  return stripped.replace(/\/[^/]+\.stories\.\w+$/, "");
}

export function storySlugFromId(storyId: string): string {
  const parts = storyId.split("--");
  if (parts.length < 2) {
    throw new Error(`Unexpected story id (missing --): ${storyId}`);
  }
  return parts.slice(1).join("--");
}

export function screenshotRelativePath(
  entry: StoryIndexEntry,
  mode: BaselinePathMode = "nested-import",
): string {
  if (mode === "story-id") {
    return `${entry.id}.png`;
  }
  if (!entry.importPath) {
    throw new Error(`Story ${entry.id} is missing importPath`);
  }
  const directory = snapshotDirFromImportPath(entry.importPath);
  return `${directory}/${storySlugFromId(entry.id)}.png`;
}

export function snapshotFileName(
  entry: StoryIndexEntry,
  mode: BaselinePathMode = "nested-import",
  project = "chromium",
  platform: NodeJS.Platform | string = "darwin",
): string {
  return screenshotRelativePath(entry, mode).replace(
    /\.png$/,
    `-${project}-${platform}.png`,
  );
}

export function baselinePublicUrl(
  entry: StoryIndexEntry,
  mode: BaselinePathMode = "nested-import",
): string {
  const file = snapshotFileName(entry, mode).replaceAll(path.sep, "/");
  return `/visual-baselines/${file}`;
}
