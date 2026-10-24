import path from "node:path";
import type { VisualSuiteOptions } from "./suite.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_SNAPSHOT_DIR,
  type BaselinePathMode,
} from "../node/options.js";
import { captureSnapshotDir } from "../node/capture-configuration.js";
export function resolveRoot(options: VisualSuiteOptions): string {
  return options.packageRoot?.trim() || process.cwd();
}

export function resolveMode(options: VisualSuiteOptions): BaselinePathMode {
  const fromEnv = process.env.VISUAL_DELTA_BASELINE_PATH_MODE?.trim();
  if (fromEnv === "story-id" || fromEnv === "nested-import") return fromEnv;
  return options.baselinePathMode ?? DEFAULT_BASELINE_PATH_MODE;
}

export function resolveSnapshotDirRel(options: VisualSuiteOptions): string {
  const fromEnv = process.env.VISUAL_DELTA_SNAPSHOT_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? path.relative(resolveRoot(options), fromEnv) || DEFAULT_SNAPSHOT_DIR
      : fromEnv;
  }
  if (options.snapshotDir?.trim()) {
    const dir = captureSnapshotDir(
      resolveRoot(options),
      options.snapshotDir.trim(),
    );
    return path.isAbsolute(dir)
      ? path.relative(resolveRoot(options), dir) || DEFAULT_SNAPSHOT_DIR
      : dir;
  }
  return captureSnapshotDir(resolveRoot(options));
}

export function resolveBaselineOverride(
  options: VisualSuiteOptions,
): string | null {
  const relative = process.env.VISUAL_DELTA_BASELINE_OVERRIDE?.trim();
  if (!relative) return null;
  const normalized = relative.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.toLowerCase().endsWith(".png") ||
    /\.(?:actual|diff)\.png$/i.test(normalized)
  ) {
    throw new Error(`Invalid VISUAL_DELTA_BASELINE_OVERRIDE: ${relative}`);
  }
  const root = resolveRoot(options);
  const snapshotRoot = path.resolve(root, resolveSnapshotDirRel(options));
  const absolute = path.resolve(snapshotRoot, ...normalized.split("/"));
  if (
    absolute !== snapshotRoot &&
    !absolute.startsWith(`${snapshotRoot}${path.sep}`)
  ) {
    throw new Error(
      `VISUAL_DELTA_BASELINE_OVERRIDE escapes snapshotDir: ${relative}`,
    );
  }
  return absolute;
}
