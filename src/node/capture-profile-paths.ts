import path from "node:path";
import { readCaptureConfiguration } from "./capture-configuration.js";

export function captureNamespace(root: string): string {
  const config = readCaptureConfiguration(root);
  if (config.source === "legacy" || config.profile === "docker") return "";
  const native = config.profiles[config.profile]!.adapter === "native";
  return `profiles/${config.profile}/${native ? process.platform : "linux"}-${native ? process.arch : "arm64"}`;
}

export function captureSnapshotDir(root: string, configured?: string): string {
  return (
    process.env.VISUAL_DELTA_STAGED_SNAPSHOT_DIR ||
    logicalCaptureSnapshotDir(root, configured)
  );
}

export function logicalCaptureSnapshotDir(
  root: string,
  configured?: string,
): string {
  const source = process.env.VISUAL_DELTA_SOURCE_SNAPSHOT_DIR;
  if (source && process.env.VISUAL_DELTA_STAGED_SNAPSHOT_DIR) return source;
  const config = readCaptureConfiguration(root);
  const base = path.resolve(
    root,
    configured?.trim() ||
      config.profiles[config.profile]!.snapshotDir ||
      "tests/visual/storybook.spec.ts-snapshots",
  );
  return withNamespace(root, base);
}

export function captureManifestSnapshotDir(
  root: string,
  argv: readonly string[],
): string {
  const index = argv.lastIndexOf("--snapshot-dir");
  return captureSnapshotDir(root, index < 0 ? undefined : argv[index + 1]);
}

export function captureCacheDir(
  root: string,
  configured = ".visual-delta/cache",
): string {
  return withNamespace(root, path.resolve(root, configured));
}

function withNamespace(root: string, base: string): string {
  const namespace = captureNamespace(root);
  return namespace &&
    !base.endsWith(`${path.sep}${namespace.replaceAll("/", path.sep)}`)
    ? path.join(base, namespace)
    : base;
}
