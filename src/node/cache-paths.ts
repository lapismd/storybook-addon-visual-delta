import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { VISUAL_DELTA_CACHE_DIR_REL } from "./visual-artifacts.js";

export const VISUAL_DELTA_CHANGE_SETS_CACHE_REL =
  `${VISUAL_DELTA_CACHE_DIR_REL}/change-sets`;
export const LEGACY_VISUAL_DELTA_CACHE_REL = ".cache/visual-delta";
export const LEGACY_VISUAL_DELTA_CHANGE_SETS_CACHE_REL =
  `${LEGACY_VISUAL_DELTA_CACHE_REL}/change-sets`;

export type LegacyChangeSetCacheMigration = {
  status: "absent" | "canonical" | "migrated" | "collision" | "failed";
  legacyPath: string;
  canonicalPath: string;
  error?: string;
};

function fileHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function copyDirectoryVerified(source: string, destination: string): void {
  const sourceStat = lstatSync(source);
  if (!sourceStat.isDirectory()) {
    throw new Error("Legacy change-set cache is not a directory.");
  }
  mkdirSync(destination, { recursive: false });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in legacy cache: ${from}`);
    }
    if (entry.isDirectory()) {
      copyDirectoryVerified(from, to);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Refusing non-file cache entry: ${from}`);
    }
    copyFileSync(from, to, constants.COPYFILE_EXCL);
    if (fileHash(from) !== fileHash(to)) {
      throw new Error(`Checksum mismatch while migrating ${from}`);
    }
  }
}

/**
 * Move the bounded review cache into the package-owned cache root. The source
 * is removed only after a complete checksummed copy has been atomically placed.
 */
export function migrateLegacyChangeSetCache(
  root: string,
): LegacyChangeSetCacheMigration {
  const resolvedRoot = path.resolve(root);
  const legacyPath = path.join(
    resolvedRoot,
    ...LEGACY_VISUAL_DELTA_CHANGE_SETS_CACHE_REL.split("/"),
  );
  const canonicalPath = path.join(
    resolvedRoot,
    ...VISUAL_DELTA_CHANGE_SETS_CACHE_REL.split("/"),
  );
  const legacyExists = existsSync(legacyPath);
  const canonicalExists = existsSync(canonicalPath);
  if (!legacyExists) {
    return {
      status: canonicalExists ? "canonical" : "absent",
      legacyPath,
      canonicalPath,
    };
  }
  if (canonicalExists) {
    return { status: "collision", legacyPath, canonicalPath };
  }

  const parent = path.dirname(canonicalPath);
  mkdirSync(parent, { recursive: true });
  const temporary = path.join(
    parent,
    `.change-sets-migrate-${process.pid}-${randomUUID()}`,
  );
  try {
    copyDirectoryVerified(legacyPath, temporary);
    renameSync(temporary, canonicalPath);
    rmSync(legacyPath, { recursive: true, force: false });
    try {
      rmdirSync(path.dirname(legacyPath));
    } catch {
      // Preserve a non-empty legacy root for doctor to inventory separately.
    }
    return { status: "migrated", legacyPath, canonicalPath };
  } catch (error) {
    if (existsSync(temporary)) {
      rmSync(temporary, { recursive: true, force: true });
    }
    return {
      status: "failed",
      legacyPath,
      canonicalPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
