import path from "node:path";
import { modeBaselineSlug } from "../shared/modes.js";
import type { BaselinePathMode } from "./options.js";

export { modeBaselineSlug };

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
    .replace(/^packages\/workspace\/src\/lib\//, "workspace/");
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
  /** Optional Chromatic-style mode name → `--{slug}` before `.png`. */
  visualModeName?: string,
): string {
  const modeSlug = visualModeName ? modeBaselineSlug(visualModeName) : "";
  const modeInfix = modeSlug ? `--${modeSlug}` : "";
  if (mode === "story-id") {
    return `${entry.id}${modeInfix}.png`;
  }
  if (!entry.importPath) {
    throw new Error(`Story ${entry.id} is missing importPath`);
  }
  const directory = snapshotDirFromImportPath(entry.importPath);
  return `${directory}/${storySlugFromId(entry.id)}${modeInfix}.png`;
}

export function snapshotFileName(
  entry: StoryIndexEntry,
  mode: BaselinePathMode = "nested-import",
  project = "chromium",
  platform: NodeJS.Platform | string = "darwin",
  /** Optional Chromatic-style mode name → `--{slug}` before project/platform. */
  visualModeName?: string,
): string {
  return screenshotRelativePath(entry, mode, visualModeName).replace(
    /\.png$/,
    `-${project}-${platform}.png`,
  );
}

export function baselinePublicUrl(
  entry: StoryIndexEntry,
  mode: BaselinePathMode = "nested-import",
  visualModeName?: string,
): string {
  const file = snapshotFileName(
    entry,
    mode,
    "chromium",
    "darwin",
    visualModeName,
  ).replaceAll(path.sep, "/");
  return `/visual-baselines/${file}`;
}
