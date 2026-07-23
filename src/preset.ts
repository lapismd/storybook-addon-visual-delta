import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";
import { visualBaselineVisualDeltaPlugin } from "./node/baseline-vite-plugin.js";
import { visualDeltaMiddlewarePlugin } from "./node/middleware.js";
import type { VisualDeltaHostOptions } from "./node/options.js";
import { watchVisualDeltaSourcePlugin } from "./node/watch-src.js";

export type { VisualDeltaHostOptions } from "./node/options.js";

/** Addon `src/` — default watch root for preview HMR. */
const defaultAddonSrcDir = fileURLToPath(new URL(".", import.meta.url));

type PresetViteFinalOptions = {
  visualDelta?: VisualDeltaHostOptions;
  /** Storybook may nest addon options under `options`. */
  options?: { visualDelta?: VisualDeltaHostOptions };
};

function resolveHostOptions(
  options: PresetViteFinalOptions = {},
): VisualDeltaHostOptions {
  return {
    addonSrcDir: defaultAddonSrcDir,
    ...options.options?.visualDelta,
    ...options.visualDelta,
  };
}

/**
 * Registers Visual Delta Vite middleware, baseline CSF inject, and addon-src
 * watch. Host Storybook still supplies `staticDirs` → `/visual-baselines`.
 *
 * Skipped under Vitest — Storybook Vitest browser runs do not need the
 * middleware/inject plugins, and prepending them can disturb React resolution
 * for React-in-Svelte panel fixtures.
 */
export async function viteFinal<T extends UserConfig>(
  config: T,
  options: PresetViteFinalOptions = {},
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
