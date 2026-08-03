import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";

export const VISUAL_DELTA_CANONICAL_BUILD_CACHE_ENV =
  "VISUAL_DELTA_CANONICAL_BUILD_CACHE";
export const CANONICAL_BUILD_CACHE_REL =
  ".visual-delta/cache/canonical-build";
export const CANONICAL_BUILD_CACHE_MAX_ENTRIES = 2;

type CanonicalBuildManifest = {
  version: 1;
  fingerprint: string;
  profileId: string;
  previewStatsSha256: string;
  staticFiles: Record<string, string>;
  createdAt: string;
};

export type CanonicalBuildCacheResult = {
  restored: boolean;
  reason:
    | "disabled"
    | "forced-rebuild"
    | "missing"
    | "invalid"
    | "hit";
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSlashes(value: string): string {
  return value.replaceAll(path.sep, "/");
}

function filesBelow(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.push(normalizeSlashes(path.relative(root, absolute)));
      }
    }
  };
  visit(root);
  return files.sort();
}

function fileHashes(root: string): Record<string, string> {
  return Object.fromEntries(
    filesBelow(root).map((relative) => [
      relative,
      sha256(readFileSync(path.resolve(root, ...relative.split("/")))),
    ]),
  );
}

function completeStatic(root: string): boolean {
  return (
    existsSync(path.join(root, "index.json")) &&
    existsSync(path.join(root, "iframe.html"))
  );
}

function copyReadableStaticTree(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  const visit = (sourceDirectory: string, destinationDirectory: string): void => {
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(destinationPath, { recursive: true, mode: 0o755 });
        visit(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        // Creating the destination from bytes avoids Docker Desktop translating
        // a cross-bind recursive copy into write-only (0200) host files.
        writeFileSync(destinationPath, readFileSync(sourcePath), { mode: 0o644 });
      }
    }
  };
  visit(source, destination);
}

function entryPath(cacheRoot: string, fingerprint: string): string {
  return path.join(cacheRoot, "entries", fingerprint);
}

function entryCreatedAt(entry: string): number {
  const manifest = readManifest(entry);
  const parsed = manifest ? Date.parse(manifest.createdAt) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  try {
    return statSync(entry).mtimeMs;
  } catch {
    return 0;
  }
}

export function pruneCanonicalBuildCache(options: {
  cacheRoot: string;
  activeFingerprint: string;
  maxEntries?: number;
}): string[] {
  const entriesRoot = path.join(options.cacheRoot, "entries");
  if (!existsSync(entriesRoot)) return [];
  const maxEntries = Math.max(
    1,
    Math.trunc(options.maxEntries ?? CANONICAL_BUILD_CACHE_MAX_ENTRIES),
  );
  const candidates = readdirSync(entriesRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^[a-f0-9]{64}$/i.test(entry.name),
    )
    .map((entry) => ({
      fingerprint: entry.name,
      path: path.join(entriesRoot, entry.name),
      createdAt: entryCreatedAt(path.join(entriesRoot, entry.name)),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
  const keep = new Set<string>([options.activeFingerprint]);
  for (const candidate of candidates) {
    if (keep.size >= maxEntries) break;
    keep.add(candidate.fingerprint);
  }
  const removed: string[] = [];
  for (const candidate of candidates) {
    if (keep.has(candidate.fingerprint)) continue;
    rmSync(candidate.path, { recursive: true, force: true });
    removed.push(candidate.fingerprint);
  }
  return removed;
}

function readManifest(entry: string): CanonicalBuildManifest | null {
  try {
    const value = JSON.parse(
      readFileSync(path.join(entry, "manifest.json"), "utf8"),
    ) as CanonicalBuildManifest;
    if (
      value.version !== 1 ||
      typeof value.fingerprint !== "string" ||
      typeof value.profileId !== "string" ||
      typeof value.previewStatsSha256 !== "string" ||
      !value.staticFiles ||
      typeof value.staticFiles !== "object"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function validEntry(options: {
  entry: string;
  fingerprint: string;
  profileId: string;
}): boolean {
  const manifest = readManifest(options.entry);
  const staticRoot = path.join(options.entry, "storybook-static");
  const statsPath = path.join(options.entry, "preview-stats.json");
  if (
    !manifest ||
    manifest.fingerprint !== options.fingerprint ||
    manifest.profileId !== options.profileId ||
    !completeStatic(staticRoot) ||
    !existsSync(statsPath) ||
    !statSync(statsPath).isFile() ||
    sha256(readFileSync(statsPath)) !== manifest.previewStatsSha256
  ) {
    return false;
  }
  const currentFiles = fileHashes(staticRoot);
  const expectedEntries = Object.entries(manifest.staticFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const currentEntries = Object.entries(currentFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(currentEntries) === JSON.stringify(expectedEntries);
}

export function resolveCanonicalBuildCacheRoot(
  root: string,
  environment = process.env,
): string | null {
  const configured = environment[VISUAL_DELTA_CANONICAL_BUILD_CACHE_ENV]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(path.resolve(root), CANONICAL_BUILD_CACHE_REL);
}

export function restoreCanonicalBuildCache(options: {
  root: string;
  cacheRoot: string | null;
  fingerprint: string | null;
  forceRebuild?: boolean;
  profileId?: string;
}): CanonicalBuildCacheResult {
  if (options.forceRebuild) return { restored: false, reason: "forced-rebuild" };
  if (!options.cacheRoot || !options.fingerprint) {
    return { restored: false, reason: "disabled" };
  }
  const profileId =
    options.profileId ?? CANONICAL_VISUAL_CAPTURE_PROFILE.id;
  const entry = entryPath(options.cacheRoot, options.fingerprint);
  if (!existsSync(entry)) return { restored: false, reason: "missing" };
  if (!validEntry({ entry, fingerprint: options.fingerprint, profileId })) {
    return { restored: false, reason: "invalid" };
  }

  const staticDestination = path.join(options.root, "storybook-static");
  const staticTemporary = path.join(
    options.root,
    `.storybook-static.restore-${randomUUID()}`,
  );
  const statsDestination = path.join(
    options.root,
    ".visual-delta/cache/preview-stats.json",
  );
  rmSync(staticTemporary, { recursive: true, force: true });
  copyReadableStaticTree(
    path.join(entry, "storybook-static"),
    staticTemporary,
  );
  rmSync(staticDestination, { recursive: true, force: true });
  renameSync(staticTemporary, staticDestination);
  mkdirSync(path.dirname(statsDestination), { recursive: true });
  writeFileSync(
    statsDestination,
    readFileSync(path.join(entry, "preview-stats.json")),
    { mode: 0o644 },
  );
  return { restored: true, reason: "hit" };
}

export function persistCanonicalBuildCache(options: {
  root: string;
  cacheRoot: string | null;
  fingerprint: string | null;
  profileId?: string;
}): boolean {
  if (!options.cacheRoot || !options.fingerprint) return false;
  const staticRoot = path.join(options.root, "storybook-static");
  const statsPath = path.join(
    options.root,
    ".visual-delta/cache/preview-stats.json",
  );
  if (!completeStatic(staticRoot) || !existsSync(statsPath)) return false;

  const entriesRoot = path.join(options.cacheRoot, "entries");
  const destination = entryPath(options.cacheRoot, options.fingerprint);
  if (
    existsSync(destination) &&
    validEntry({
      entry: destination,
      fingerprint: options.fingerprint,
      profileId:
        options.profileId ?? CANONICAL_VISUAL_CAPTURE_PROFILE.id,
    })
  ) {
    pruneCanonicalBuildCache({
      cacheRoot: options.cacheRoot,
      activeFingerprint: options.fingerprint,
    });
    return true;
  }

  mkdirSync(entriesRoot, { recursive: true });
  const temporary = path.join(
    entriesRoot,
    `.${options.fingerprint}-${randomUUID()}.tmp`,
  );
  rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { recursive: true });
  try {
    cpSync(staticRoot, path.join(temporary, "storybook-static"), {
      recursive: true,
    });
    cpSync(statsPath, path.join(temporary, "preview-stats.json"));
    const manifest: CanonicalBuildManifest = {
      version: 1,
      fingerprint: options.fingerprint,
      profileId:
        options.profileId ?? CANONICAL_VISUAL_CAPTURE_PROFILE.id,
      previewStatsSha256: sha256(readFileSync(statsPath)),
      staticFiles: fileHashes(staticRoot),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    rmSync(destination, { recursive: true, force: true });
    renameSync(temporary, destination);
    pruneCanonicalBuildCache({
      cacheRoot: options.cacheRoot,
      activeFingerprint: options.fingerprint,
    });
    return true;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
