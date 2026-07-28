import path from "node:path";

const GENERATED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".jj",
  ".svelte-kit",
  ".turbo",
  "blob-report",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "storybook-static-check",
  "test-results",
]);

export type InvalidatableCache<T> = {
  get(): T;
  invalidate(): void;
};

/**
 * Retain the expensive affected-story plan between manager reloads so it
 * cannot block the preview's render-critical module requests.
 *
 * Action endpoints still calculate a fresh plan before running; this cache is
 * only for the Testing Module's informational bootstrap request.
 */
export function createInvalidatableCache<T>(
  calculate: () => T,
): InvalidatableCache<T> {
  let cached: { value: T } | undefined;
  return {
    get() {
      cached ??= { value: calculate() };
      return cached.value;
    },
    invalidate() {
      cached = undefined;
    },
  };
}

/**
 * Generated output churn must not evict the manager bootstrap cache. Source
 * changes, the static story index, and the affected graph remain relevant.
 */
export function affectsAffectedPlan(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return false;
  }
  const normalized = relative.replaceAll("\\", "/");
  if (
    normalized === "storybook-static/index.json" ||
    normalized === ".cache/visual-delta/preview-stats.json"
  ) {
    return true;
  }
  const [directory] = normalized.split("/");
  return !directory || !GENERATED_DIRECTORIES.has(directory);
}
