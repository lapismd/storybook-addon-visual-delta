/**
 * Build `/visual-baselines/…` URLs for the panel after create/update when CSF
 * HMR has not yet re-emitted INIT_IMAGE. Mirrors `src/node/baseline-design`.
 */

export const VISUAL_BASELINE_SUFFIX = "-chromium-darwin";

const WIRED_SNAPSHOT_PREFIXES = ["shadcn/", "forms/", "workspace/"] as const;

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

export function baselineUrlForStoryRef(
  story: {
    id?: string;
    importPath?: string;
    tags?: string[];
  },
  options?: {
    /**
     * After create-baseline, the manager index may still list `skip-visual`
     * until HMR refreshes — still build the URL so the panel can hydrate.
     */
    allowSkipVisual?: boolean;
  },
): string | undefined {
  const id = story.id ?? "";
  const tags = story.tags ?? [];
  if (!options?.allowSkipVisual && tags.includes("skip-visual")) {
    return undefined;
  }
  if (!id.includes("--") || !story.importPath) return undefined;
  const directory = snapshotDirFromImportPath(story.importPath);
  if (!WIRED_SNAPSHOT_PREFIXES.some((prefix) => directory.startsWith(prefix))) {
    return undefined;
  }
  return `/visual-baselines/${directory}/${storySlugFromId(id)}${VISUAL_BASELINE_SUFFIX}.png`;
}
