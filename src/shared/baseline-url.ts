/**
 * Build `/visual-baselines/…` URLs for the panel after create/update when CSF
 * HMR has not yet re-emitted INIT_IMAGE. Mirrors `src/node/baseline-design`.
 */

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

function slugifyPathPart(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function collisionSafeSnapshotDir(story: {
  id: string;
  importPath: string;
}): string {
  const directory = snapshotDirFromImportPath(story.importPath);
  const normalized = story.importPath.replace(/\\/g, "/");
  const match = normalized.match(/\/([^/]+)\.stories\.\w+$/);
  if (!match) return directory;

  const parts = directory.split("/");
  const storyFile = slugifyPathPart(match[1]!);
  const directoryLeaf = slugifyPathPart(parts.at(-1) ?? "");
  if (parts.length < 2 || storyFile === directoryLeaf) return directory;

  const storyPrefix = story.id.split("--")[0] ?? "";
  const directoryPrefix = parts.map(slugifyPathPart).join("-");
  return storyPrefix.startsWith(`${directoryPrefix}-`)
    ? `${directory}/${storyFile}`
    : directory;
}

function isSafeSnapshotDirectory(directory: string): boolean {
  const parts = directory.split("/");
  return (
    parts.length > 0 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        part !== "." &&
        part !== ".." &&
        /^[a-zA-Z0-9._-]+$/.test(part),
    )
  );
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
    environment?: import("./environments.js").VisualBaselineEnvironment;
  },
): string | undefined {
  const id = story.id ?? "";
  const tags = story.tags ?? [];
  if (!options?.allowSkipVisual && tags.includes("skip-visual")) {
    return undefined;
  }
  if (!id.includes("--") || !story.importPath) return undefined;
  const directory = collisionSafeSnapshotDir({
    id,
    importPath: story.importPath,
  });
  if (!isSafeSnapshotDirectory(directory)) return undefined;
  const suffix = options?.environment
    ? `-${options.environment.browser}-${options.environment.platform}`
    : VISUAL_BASELINE_SUFFIX;
  return `/visual-baselines/${directory}/${storySlugFromId(id)}${suffix}.png`;
}
