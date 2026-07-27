import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  resolveBaselinePathMode,
  resolveSnapshotDir,
  type VisualDeltaHostOptions,
} from "./options.js";
import { snapshotFileName } from "./snapshot-paths.js";
import { patchStoryRemoveBaseline } from "./story-source.js";
import { loadStoryIndex } from "./visual-sidecars.js";

export type DeleteVisualBaselineRequest = {
  storyId: string;
  baselineUrl: string;
  interactionId?: string;
};

export type DeleteVisualBaselineResult = {
  ok: true;
  storyId: string;
  baselineUrl: string;
  sourceUpdated: boolean;
  deletedFiles: string[];
};

function relativeBaselinePath(baselineUrl: string): string {
  const parsed = new URL(baselineUrl, "http://visual-delta.local");
  const prefix = "/visual-baselines/";
  if (!parsed.pathname.startsWith(prefix)) {
    throw new Error("Screenshot must be served from /visual-baselines/");
  }
  const decoded = decodeURIComponent(parsed.pathname.slice(prefix.length));
  const normalized = path.posix.normalize(decoded.replaceAll("\\", "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error("Invalid baseline screenshot path");
  }
  return normalized;
}

function assertBaselineBelongsToStory(options: {
  root: string;
  hostOptions: VisualDeltaHostOptions;
  storyId: string;
  relativePath: string;
}) {
  const entry = loadStoryIndex(options.root)[options.storyId];
  if (!entry) {
    throw new Error(`Story not found in index: ${options.storyId}`);
  }
  const expected = snapshotFileName(
    entry,
    resolveBaselinePathMode(options.hostOptions),
  ).replaceAll(path.sep, "/");
  const expectedDir = path.posix.dirname(expected);
  const expectedName = path.posix.basename(expected);
  const suffix = "-chromium-darwin.png";
  const stem = expectedName.endsWith(suffix)
    ? expectedName.slice(0, -suffix.length)
    : expectedName.replace(/\.png$/i, "");
  const actualDir = path.posix.dirname(options.relativePath);
  const actualName = path.posix.basename(options.relativePath);
  const belongs =
    actualDir === expectedDir &&
    (actualName === expectedName ||
      (actualName.startsWith(`${stem}--`) && actualName.endsWith(suffix)));
  if (!belongs) {
    throw new Error(
      `Screenshot does not belong to story ${options.storyId}: ${options.relativePath}`,
    );
  }
}

function derivedBaselineFiles(absolutePng: string): string[] {
  const stem = absolutePng.replace(/\.png$/i, "");
  return [
    absolutePng,
    `${stem}.actual.png`,
    `${stem}.diff.png`,
    `${stem}.json`,
  ];
}

/**
 * Delete one exact baseline and its derived comparison artifacts. The story
 * source and static index are updated for the same story before returning.
 */
export function deleteVisualBaseline(
  root: string,
  hostOptions: VisualDeltaHostOptions,
  request: DeleteVisualBaselineRequest,
): DeleteVisualBaselineResult {
  const storyId = request.storyId.trim();
  const baselineUrl = request.baselineUrl.trim();
  if (!storyId || !baselineUrl) {
    throw new Error("Provide storyId and baselineUrl");
  }

  const relativePath = relativeBaselinePath(baselineUrl);
  assertBaselineBelongsToStory({
    root,
    hostOptions,
    storyId,
    relativePath,
  });

  const snapshotRoot = path.resolve(resolveSnapshotDir(hostOptions, root));
  const absolutePng = path.resolve(snapshotRoot, ...relativePath.split("/"));
  if (
    absolutePng !== snapshotRoot &&
    !absolutePng.startsWith(`${snapshotRoot}${path.sep}`)
  ) {
    throw new Error("Baseline screenshot resolves outside the snapshot folder");
  }
  if (!existsSync(absolutePng)) {
    throw new Error(`Baseline screenshot not found: ${relativePath}`);
  }

  const patch = patchStoryRemoveBaseline({
    packageRoot: root,
    storyId,
    url: baselineUrl,
    interactionId: request.interactionId?.trim() || undefined,
  });
  if (!patch.ok) {
    throw new Error(patch.error ?? `Could not update story ${storyId}`);
  }

  const deletedFiles: string[] = [];
  for (const filePath of derivedBaselineFiles(absolutePng)) {
    if (!existsSync(filePath)) continue;
    unlinkSync(filePath);
    deletedFiles.push(path.relative(root, filePath).replaceAll(path.sep, "/"));
  }

  return {
    ok: true,
    storyId,
    baselineUrl,
    sourceUpdated: patch.sourceUpdated ?? false,
    deletedFiles,
  };
}
