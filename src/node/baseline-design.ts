/**
 * Map catalog Storybook stories to committed Playwright visual baselines
 * served via staticDirs at `/visual-baselines`.
 *
 * On-disk filenames use the Playwright project + host platform suffix that
 * this repo commits today (`-chromium-darwin`).
 */

import {
  snapshotDirFromImportPath,
  VISUAL_BASELINE_SUFFIX as SHARED_SUFFIX,
} from "../shared/baseline-url.js";

export const VISUAL_BASELINE_SUFFIX = SHARED_SUFFIX;

export type BaselineStoryRef = {
  title?: string;
  id?: string;
  importPath?: string;
  tags?: string[];
};

/** Story-id slug after `--` (e.g. open-menu). */
export function storySlugFromId(storyId: string): string {
  const parts = storyId.split("--");
  if (parts.length < 2) {
    throw new Error(`Unexpected story id (missing --): ${storyId}`);
  }
  return parts.slice(1).join("--");
}

/** Last title segment as a kebab folder name (Input Group → input-group). */
export function familyFromTitle(title: string): string {
  const segment = title.split("/").pop()?.trim() ?? "";
  return segment.toLowerCase().replace(/\s+/g, "-");
}

const WIRED_SNAPSHOT_PREFIXES = [
  "shadcn/",
  "forms/",
  "apps/",
  "tasks/",
] as const;

function isWiredSnapshotDir(directory: string): boolean {
  return WIRED_SNAPSHOT_PREFIXES.some((prefix) => directory.startsWith(prefix));
}

/**
 * Returns a baseline PNG URL for catalog stories that participate in visual
 * baselines, or undefined when the story should not show one.
 */
export function baselineUrlForStory(
  story: BaselineStoryRef,
): string | undefined {
  const title = story.title ?? "";
  const id = story.id ?? "";
  const tags = story.tags ?? [];

  if (tags.includes("skip-visual")) return undefined;
  if (!id.includes("--")) return undefined;

  if (story.importPath) {
    const directory = snapshotDirFromImportPath(story.importPath);
    if (isWiredSnapshotDir(directory)) {
      return `/visual-baselines/${directory}/${storySlugFromId(id)}${VISUAL_BASELINE_SUFFIX}.png`;
    }
  }

  // Title-only fallback when importPath is missing (Shadcn catalog).
  if (title.startsWith("Shadcn/")) {
    const family = familyFromTitle(title);
    if (!family) return undefined;
    return `/visual-baselines/shadcn/${family}/${storySlugFromId(id)}${VISUAL_BASELINE_SUFFIX}.png`;
  }

  return undefined;
}

/**
 * `parameters.visualDelta` for storybook-addon-visual-delta.
 * First baseline auto-selects on load; component-clipped PNGs pin to the
 * story canvas; default split puts the baseline to the right of live.
 */
export function visualBaselineVisualDeltaParameter(src: string) {
  return {
    images: [src],
    opacity: 0.5,
    colorInversion: false,
    align: "canvas" as const,
    placement: "right" as const,
    passThresholdPercent: 0.1,
  };
}
