import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import {
  readCanonicalBuildManifest,
  CANONICAL_BUILD_CACHE_MAX_ENTRIES,
} from "./canonical-build-cache.js";
function entryCreatedAt(entry: string): number {
  const manifest = readCanonicalBuildManifest(entry);
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
