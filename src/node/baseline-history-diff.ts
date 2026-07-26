import path from "node:path";
import type {
  BaselineHistoryDiffFile,
  BaselineHistoryDiffHunk,
  BaselineHistoryDiffLine,
} from "../shared/baseline-history.js";

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mdx",
  ".scss",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);
const MAX_FILES = 30;
const MAX_LINES = 1_500;

type PendingLine = { number: number; text: string };

function diffPath(value: string | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/\\([\\"])/g, "$1");
  if (normalized === "/dev/null") return normalized;
  return normalized.replace(/^[ab]\//, "");
}

function relevantSource(
  beforePath: string,
  afterPath: string,
  componentPath?: string,
): boolean {
  const candidates = [beforePath, afterPath].filter(
    (candidate) => candidate && candidate !== "/dev/null",
  );
  if (
    !candidates.some((candidate) =>
      SOURCE_EXTENSIONS.has(path.extname(candidate)),
    )
  ) {
    return false;
  }
  if (!componentPath) return true;
  const normalized = componentPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const directory = path.posix.dirname(normalized);
  if (directory === ".") return true;
  return candidates.some(
    (candidate) =>
      candidate === normalized || candidate.startsWith(`${directory}/`),
  );
}

function parseHunk(
  lines: string[],
  start: number,
): {
  hunk: BaselineHistoryDiffHunk | null;
  next: number;
} {
  const header = lines[start] ?? "";
  const range = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (!range) return { hunk: null, next: start + 1 };

  let beforeNumber = Number(range[1]);
  let afterNumber = Number(range[2]);
  const rows: BaselineHistoryDiffLine[] = [];
  let removed: PendingLine[] = [];
  let added: PendingLine[] = [];

  const flushChanges = () => {
    const length = Math.max(removed.length, added.length);
    for (let index = 0; index < length; index += 1) {
      const before = removed[index] ?? null;
      const after = added[index] ?? null;
      rows.push({
        beforeNumber: before?.number ?? null,
        afterNumber: after?.number ?? null,
        before: before?.text ?? null,
        after: after?.text ?? null,
        kind: before && after ? "changed" : before ? "removed" : "added",
      });
    }
    removed = [];
    added = [];
  };

  let index = start + 1;
  while (index < lines.length && !lines[index]!.startsWith("@@ ")) {
    const line = lines[index]!;
    if (line.startsWith("diff --git ")) break;
    if (line.startsWith("\\")) {
      index += 1;
      continue;
    }
    if (line.startsWith("-")) {
      removed.push({ number: beforeNumber, text: line.slice(1) });
      beforeNumber += 1;
    } else if (line.startsWith("+")) {
      added.push({ number: afterNumber, text: line.slice(1) });
      afterNumber += 1;
    } else if (line.startsWith(" ")) {
      flushChanges();
      rows.push({
        beforeNumber,
        afterNumber,
        before: line.slice(1),
        after: line.slice(1),
        kind: "context",
      });
      beforeNumber += 1;
      afterNumber += 1;
    }
    index += 1;
  }
  flushChanges();
  return {
    hunk: rows.length > 0 ? { header, lines: rows } : null,
    next: index,
  };
}

function parseFileBlock(
  block: string[],
  componentPath?: string,
): BaselineHistoryDiffFile | null {
  const beforeMarker = block.find((line) => line.startsWith("--- "));
  const afterMarker = block.find((line) => line.startsWith("+++ "));
  const fallback = /^diff --git a\/(.+) b\/(.+)$/.exec(block[0] ?? "");
  const beforePath = diffPath(beforeMarker?.slice(4) ?? fallback?.[1]);
  const afterPath = diffPath(afterMarker?.slice(4) ?? fallback?.[2]);
  if (!relevantSource(beforePath, afterPath, componentPath)) return null;

  const hunks: BaselineHistoryDiffHunk[] = [];
  let index = 0;
  while (index < block.length) {
    if (!block[index]!.startsWith("@@ ")) {
      index += 1;
      continue;
    }
    const parsed = parseHunk(block, index);
    if (parsed.hunk) hunks.push(parsed.hunk);
    index = parsed.next;
  }
  return hunks.length > 0 ? { beforePath, afterPath, hunks } : null;
}

export function parseBaselineComponentDiff(
  patch: string,
  componentPath?: string,
): { files: BaselineHistoryDiffFile[]; truncated: boolean } {
  const lines = patch.split(/\r?\n/);
  const starts = lines
    .map((line, index) => (line.startsWith("diff --git ") ? index : -1))
    .filter((index) => index >= 0);
  const files: BaselineHistoryDiffFile[] = [];
  let totalLines = 0;
  let truncated = false;

  for (let blockIndex = 0; blockIndex < starts.length; blockIndex += 1) {
    const start = starts[blockIndex]!;
    const end = starts[blockIndex + 1] ?? lines.length;
    const file = parseFileBlock(lines.slice(start, end), componentPath);
    if (!file) continue;
    const fileLines = file.hunks.reduce(
      (count, hunk) => count + hunk.lines.length,
      0,
    );
    if (files.length >= MAX_FILES || totalLines + fileLines > MAX_LINES) {
      truncated = true;
      break;
    }
    files.push(file);
    totalLines += fileLines;
  }

  return { files, truncated };
}
