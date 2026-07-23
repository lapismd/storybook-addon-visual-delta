/**
 * Host wiring for Visual Delta Vite middleware + baseline inject.
 * Defaults follow the desired host layout documented in the package README
 * (`tests/visual/storybook.spec.ts-snapshots`, `scripts/ui-generator/cli.ts`).
 */

export type VisualDeltaHostOptions = {
  /**
   * Repo root for spawn cwd and host script resolution.
   * Defaults to Vite `config.root` / `process.cwd()`.
   */
  root?: string;
  /**
   * Absolute or root-relative directory of committed Playwright PNGs.
   * Default: `tests/visual/storybook.spec.ts-snapshots`.
   */
  snapshotDir?: string;
  /**
   * Absolute path to the addon package `src/` for Vite watch/reload.
   * When set, `viteFinal` watches it for preview HMR.
   */
  addonSrcDir?: string;
  /**
   * CLI argv after `pnpm` for primary baseline writes
   * (`visual-update`). Mode flags (`--create-only`, `--story-id`, …) are appended.
   */
  visualUpdateArgs?: string[];
  /**
   * CLI argv after `pnpm` for interaction baseline writes
   * (`visual-interaction-update`). Story/step flags are appended.
   */
  visualInteractionUpdateArgs?: string[];
  /** Whether `/__visual-delta/run-tests` may run `build-storybook` first. */
  allowRebuild?: boolean;
};

export const DEFAULT_SNAPSHOT_DIR =
  "tests/visual/storybook.spec.ts-snapshots";

export const DEFAULT_VISUAL_UPDATE_ARGS = [
  "exec",
  "tsx",
  "scripts/ui-generator/cli.ts",
  "visual-update",
  "--allow-dirty",
  "--approved",
] as const;

export const DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS = [
  "exec",
  "tsx",
  "scripts/ui-generator/cli.ts",
  "visual-interaction-update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
] as const;

export function resolveSnapshotDir(
  options: VisualDeltaHostOptions | undefined,
  root: string,
): string {
  const configured = options?.snapshotDir?.trim();
  if (!configured) {
    return `${root}/${DEFAULT_SNAPSHOT_DIR}`.replace(/\/{2,}/g, "/");
  }
  if (configured.startsWith("/")) return configured;
  return `${root}/${configured}`.replace(/\/{2,}/g, "/");
}

export function resolveRoot(
  options: VisualDeltaHostOptions | undefined,
  fallback: string,
): string {
  return options?.root?.trim() || fallback;
}
