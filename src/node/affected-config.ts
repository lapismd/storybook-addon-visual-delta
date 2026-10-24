import { createHash } from "node:crypto";
import path from "node:path";
import type { VisualCaptureProfile } from "../shared/capture-profile.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import {
  resolveSnapshotDir,
  resolveBaselinePathMode,
  type AffectedVisualTestsOptions,
  type VisualDeltaHostOptions,
} from "./options.js";
import { captureCacheDir } from "./capture-configuration.js";
const DEFAULT_CACHE_DIR = ".visual-delta/cache";
const normalizeSlashes = (value: string) => value.replaceAll("\\", "/");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function affectedOptions(
  hostOptions: VisualDeltaHostOptions | undefined,
): AffectedVisualTestsOptions {
  return hostOptions?.affectedTests === false
    ? {}
    : (hostOptions?.affectedTests ?? {});
}

export function normalizedAffectedGlobs(globs: string[] | undefined): string[] {
  return [
    ...new Set((globs ?? []).map((glob) => glob.trim()).filter(Boolean)),
  ].sort();
}

export function resolveCacheDir(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): string {
  const configured = affectedOptions(hostOptions).cacheDir?.trim();
  return captureCacheDir(root, configured || DEFAULT_CACHE_DIR);
}

export function configFingerprint(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
  profile: VisualCaptureProfile,
): string {
  const options = affectedOptions(hostOptions);
  const project = readVisualDeltaProjectConfig(root);
  return sha256(
    JSON.stringify({
      baselinePathMode: resolveBaselinePathMode(hostOptions),
      externals: normalizedAffectedGlobs(options.externals),
      untraced: normalizedAffectedGlobs(options.untraced),
      browsers: project.browsers,
      visualTestFailureMode: project.workflow.visualTestFailureMode,
      captureProfile: profile,
    }),
  );
}

export function legacyConfigFingerprintCandidates(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): Set<string> {
  const options = affectedOptions(hostOptions);
  const project = readVisualDeltaProjectConfig(root);
  const snapshotAbsolute = resolveSnapshotDir(hostOptions, root);
  const snapshotRelative = normalizeSlashes(
    path.relative(root, snapshotAbsolute),
  );
  const cacheAbsolute = resolveCacheDir(root, hostOptions);
  const cacheRelative = normalizeSlashes(path.relative(root, cacheAbsolute));
  const snapshotValues = new Set<string | null>([
    hostOptions?.snapshotDir ?? null,
    snapshotAbsolute,
    snapshotRelative,
    `/workspace/${snapshotRelative}`,
    "/workspace/.visual-delta/capture-inputs/snapshot-dir",
  ]);
  const cacheValues = new Set<string | null>([
    options.cacheDir ?? null,
    cacheAbsolute,
    cacheRelative,
    `/workspace/${cacheRelative}`,
  ]);
  const fingerprints = new Set<string>();
  for (const snapshotDir of snapshotValues) {
    for (const cacheDir of cacheValues) {
      fingerprints.add(
        sha256(
          JSON.stringify({
            baselinePathMode: resolveBaselinePathMode(hostOptions),
            cacheDir,
            externals: normalizedAffectedGlobs(options.externals),
            snapshotDir,
            untraced: normalizedAffectedGlobs(options.untraced),
            browsers: project.browsers,
            visualTestFailureMode: project.workflow.visualTestFailureMode,
          }),
        ),
      );
    }
  }
  return fingerprints;
}
