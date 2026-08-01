/**
 * Map catalog Storybook stories to committed Playwright visual baselines
 * served via staticDirs at `/visual-baselines`.
 *
 * On-disk filenames use only the Playwright browser project suffix.
 */

import {
  baselineUrlForStoryRef,
  VISUAL_BASELINE_SUFFIX as SHARED_SUFFIX,
} from "../shared/baseline-url.js";
import {
  VISUAL_DELTA_BROWSERS,
  withVisualBaselineTarget,
} from "../shared/environments.js";

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
    const url = baselineUrlForStoryRef(story);
    if (url) return url;
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
 * `parameters.visualDelta` for @lapismd/storybook-addon-visual-delta.
 * The first matching-browser baseline auto-selects on load; component-clipped PNGs pin to the
 * story canvas; default split puts the baseline to the right of live.
 */
export function visualBaselineVisualDeltaParameter(src: string | string[]) {
  return {
    images: Array.isArray(src) ? src : [src],
    opacity: 0.5,
    colorInversion: false,
    align: "canvas" as const,
    placement: "right" as const,
  };
}

/** Discover every committed browser variant of a canonical baseline URL. */
export function existingVisualBaselineUrls(
  canonicalUrl: string,
  baselineExists: (url: string) => boolean,
): string[] {
  const candidates = [
    canonicalUrl,
    ...VISUAL_DELTA_BROWSERS.map((browser) =>
      withVisualBaselineTarget(canonicalUrl, { browser }),
    ),
  ];
  return [...new Set(candidates)].filter(baselineExists);
}
