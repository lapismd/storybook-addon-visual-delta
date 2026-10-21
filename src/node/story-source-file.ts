import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  patchStorySourceText,
  type StorySourceMutation,
} from "./story-source.js";
import { stagedNativeStoryPath } from "./native-write-transaction.js";
import {
  formatStorySource,
  type StorySourceFormatter,
} from "./story-source-formatter.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";
export function resolveStoriesPath(
  packageRoot: string,
  importPath: string,
): string | null {
  const normalized = importPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.join(packageRoot, normalized);
  return existsSync(absolute) ? absolute : null;
}

export function patchStoryFile(
  packageRoot: string,
  entry: StoryIndexEntry,
  mutation: StorySourceMutation,
  formatter?: StorySourceFormatter,
): { changed: boolean; error?: string } {
  if (!entry.importPath) return { changed: false };
  const originalPath = resolveStoriesPath(packageRoot, entry.importPath);
  const filePath = originalPath
    ? stagedNativeStoryPath(packageRoot, originalPath)
    : null;
  if (!filePath) return { changed: false };
  const source = readFileSync(filePath, "utf8");
  const candidate = patchStorySourceText(source, entry, mutation);
  if (candidate === source) return { changed: false };
  try {
    const next = formatStorySource({
      packageRoot,
      filePath,
      source: candidate,
      formatter,
    });
    writeFileSync(filePath, next, "utf8");
    return { changed: true };
  } catch (error) {
    return {
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
