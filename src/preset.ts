import { fileURLToPath } from "node:url";
import path from "node:path";
import type { UserConfig } from "vite";
import { visualBaselineVisualDeltaPlugin } from "./node/baseline-vite-plugin.js";
import { visualDeltaMiddlewarePlugin } from "./node/middleware.js";
import {
  DEFAULT_SNAPSHOT_DIR,
  type VisualDeltaHostOptions,
} from "./node/options.js";
import {
  renderReadOnlyManagerHead,
  renderToolbarStatusManagerHead,
  resolveToolbarStatusEnabled,
} from "./shared/manager-options.js";
import { watchVisualDeltaSourcePlugin } from "./node/watch-src.js";

export type { VisualDeltaHostOptions } from "./node/options.js";

/**
 * Packaged preset ownership (Storybook 10+):
 * - `staticDirs` + `viteFinal` live here
 * - `manager` / `preview` come from bare package registration
 *   (`@lapismd/storybook-addon-visual-delta/{manager,preview}` via Storybook's
 *   virtual addon resolution). Do **not** re-append them here — that
 *   duplicates the module and breaks the build.
 *
 * Local source development still needs absolute `managerEntries` /
 * `previewAnnotations` in a host preset (see catalog
 * `.storybook/visual-delta-preset.ts`) because that path is not the
 * package name and does not auto-load those exports.
 */

/** Addon `src/` — default watch root for preview HMR when developing from source. */
const defaultAddonSrcDir = fileURLToPath(new URL(".", import.meta.url));

type PresetOptions = {
  visualDelta?: VisualDeltaHostOptions;
  /** Storybook may nest addon options under `options`. */
  options?: { visualDelta?: VisualDeltaHostOptions };
};

function resolveHostOptions(
  options: PresetOptions = {},
): VisualDeltaHostOptions {
  return {
    addonSrcDir: defaultAddonSrcDir,
    ...options.options?.visualDelta,
    ...options.visualDelta,
  };
}

/**
 * Pass the narrow manager-only host option into Storybook's separately bundled
 * manager runtime. Keep this independent from preview parameters and persisted
 * project defaults.
 */
export function managerHead(
  existing = "",
  options: PresetOptions = {},
): string {
  const host = resolveHostOptions(options);
  const enabled = resolveToolbarStatusEnabled(host.showToolbarStatusLabels);
  return `${existing}${renderToolbarStatusManagerHead(enabled)}${renderReadOnlyManagerHead(host.readOnly === true)}`;
}

function resolveSnapshotDirFromOptions(options: PresetOptions = {}): string {
  const host = resolveHostOptions(options);
  const configured = host.snapshotDir?.trim();
  if (configured?.startsWith("/")) return configured;
  return path.join(
    host.root?.trim() || process.cwd(),
    configured || DEFAULT_SNAPSHOT_DIR,
  );
}

type StaticDirEntry = string | { from: string; to: string };

/**
 * Mount committed baseline PNGs at `/visual-baselines` (Chromatic-style
 * preset `staticDirs`). Skips when the host already maps that path.
 */
export function staticDirs(
  existing: StaticDirEntry[] = [],
  options: PresetOptions = {},
): StaticDirEntry[] {
  const to = "/visual-baselines";
  const already = existing.some(
    (entry) => typeof entry === "object" && entry?.to === to,
  );
  if (already) return existing;
  return [
    ...existing,
    {
      from: resolveSnapshotDirFromOptions(options),
      to,
    },
  ];
}

/**
 * Registers Visual Delta Vite middleware, baseline CSF inject, and addon-src
 * watch. Baseline files are mounted via {@link staticDirs}.
 *
 * Skipped under Vitest — Storybook Vitest browser runs do not need the
 * middleware/inject plugins, and prepending them can disturb React resolution
 * for React-in-Svelte panel fixtures.
 */
export async function viteFinal<T extends UserConfig>(
  config: T,
  options: PresetOptions = {},
): Promise<T> {
  if (process.env.VITEST) {
    return config;
  }

  const host = resolveHostOptions(options);
  const watch = watchVisualDeltaSourcePlugin(host);
  const existing = config.plugins ?? [];
  return {
    ...config,
    plugins: [
      visualBaselineVisualDeltaPlugin(host),
      visualDeltaMiddlewarePlugin(host),
      ...(watch ? [watch] : []),
      ...existing,
    ],
  };
}

export async function webpack<T>(config: T): Promise<T> {
  return config;
}
