/**
 * Host wiring for Visual Delta Vite middleware + baseline inject.
 * Defaults target a portable consumer layout (package CLI + story-id PNGs).
 * The UI catalog overrides argv / path mode in `.storybook/main.ts`.
 */

export type AffectedVisualTestsOptions = {
  /**
   * Local disposable state and Storybook `preview-stats.json`.
   * Default: `.cache/visual-delta`.
   */
  cacheDir?: string;
  /**
   * Project-relative globs whose changes can affect every story, including
   * static assets that Storybook serves outside the preview module graph.
   */
  externals?: string[];
  /**
   * Project-relative globs to ignore while tracing. Disabled by default;
   * enabling this reduces visual-test coverage.
   */
  untraced?: string[];
};

export type VisualDeltaHostOptions = {
  /**
   * Show the current story's named visual-review status in the Storybook
   * toolbar. The icon-only sidebar status is unaffected. Defaults to true.
   */
  showToolbarStatusLabels?: boolean;
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
   * How committed baseline PNGs are addressed.
   *
   * `story-id` (default) stores one flat PNG per Storybook story id.
   * `nested-import` preserves component-folder layouts (UI catalog).
   */
  baselinePathMode?: BaselinePathMode;
  /**
   * Absolute path to the addon package `src/` for Vite watch/reload.
   * When set, `viteFinal` watches it for preview HMR.
   */
  addonSrcDir?: string;
  /**
   * CLI argv after `pnpm` for primary baseline writes.
   * Mode flags (`--create-only`, `--story-id`, …) are appended.
   */
  visualUpdateArgs?: string[];
  /**
   * CLI argv after `pnpm` for interaction baseline writes.
   * Story/step flags are appended.
   */
  visualInteractionUpdateArgs?: string[];
  /**
   * CLI argv after `pnpm` for compare-only visual runs.
   * Reporter and grep flags are appended by the middleware.
   */
  visualTestArgs?: string[];
  /**
   * Port used by the visual Playwright config's static Storybook server.
   * Defaults to Storybook port + 1 (see `resolveVisualServerPort`).
   */
  visualServerPort?: number;
  /** Whether `/__visual-delta/run-tests` may run `build-storybook` first. */
  allowRebuild?: boolean;
  /**
   * TurboSnap-style local affected selection. Disabled unless configured.
   * Full runs remain available and continue to seed this disposable cache.
   */
  affectedTests?: false | AffectedVisualTestsOptions;
};

export type BaselinePathMode = "nested-import" | "story-id";

export const DEFAULT_SNAPSHOT_DIR = "tests/visual/storybook.spec.ts-snapshots";

/** Portable default — flat PNGs keyed by story id. */
export const DEFAULT_BASELINE_PATH_MODE: BaselinePathMode = "story-id";

/**
 * Packaged CLI (`visual-delta update`). Hosts with custom writers override
 * via `options.visualDelta.visualUpdateArgs`.
 */
export const DEFAULT_VISUAL_UPDATE_ARGS = [
  "exec",
  "visual-delta",
  "update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
] as const;

export const DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS = [
  "exec",
  "visual-delta",
  "interaction-update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
] as const;

export const DEFAULT_VISUAL_TEST_ARGS = ["exec", "playwright", "test"] as const;

/** Upstream Storybook `storybook dev` default when `STORYBOOK_PORT` is unset. */
export const DEFAULT_STORYBOOK_PORT = 6006;

/**
 * Fallback static port when Storybook port is the upstream default (6006 + 1).
 * Prefer `resolveVisualServerPort()` so hosts on custom Storybook ports follow
 * `STORYBOOK_PORT + 1`.
 */
export const DEFAULT_VISUAL_SERVER_PORT = DEFAULT_STORYBOOK_PORT + 1;

function parsePortEnv(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return undefined;
  const port = Number(trimmed);
  return Number.isFinite(port) && port > 0 ? port : undefined;
}

/** Storybook UI port: explicit arg → `STORYBOOK_PORT` → 6006. */
export function resolveStorybookPort(explicit?: number): number {
  if (
    typeof explicit === "number" &&
    Number.isFinite(explicit) &&
    explicit > 0
  ) {
    return explicit;
  }
  return parsePortEnv(process.env.STORYBOOK_PORT) ?? DEFAULT_STORYBOOK_PORT;
}

/**
 * Static `storybook-static` port for Playwright / warm server:
 * `options.visualServerPort` → `VISUAL_SERVER_PORT` → Storybook port + 1.
 *
 * Pass the live Storybook listen port as `storybookPort` from Vite middleware
 * so concurrent catalogs (e.g. 9009 / 9109) each get an isolated +1 port.
 */
export function resolveVisualServerPort(
  options?: Pick<VisualDeltaHostOptions, "visualServerPort">,
  storybookPort?: number,
): number {
  if (
    typeof options?.visualServerPort === "number" &&
    Number.isFinite(options.visualServerPort) &&
    options.visualServerPort > 0
  ) {
    return options.visualServerPort;
  }
  const fromEnv =
    parsePortEnv(process.env.VISUAL_SERVER_PORT) ??
    parsePortEnv(process.env.VISUAL_DELTA_SERVER_PORT);
  if (fromEnv != null) return fromEnv;
  return resolveStorybookPort(storybookPort) + 1;
}

export function resolveBaselinePathMode(
  options: VisualDeltaHostOptions | undefined,
): BaselinePathMode {
  return options?.baselinePathMode ?? DEFAULT_BASELINE_PATH_MODE;
}

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
