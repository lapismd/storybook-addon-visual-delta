import path from "node:path";

export const VISUAL_DELTA_ARTIFACT_DIR_REL = ".visual-delta/artifacts";
export const VISUAL_DELTA_CACHE_DIR_REL = ".visual-delta/cache";
export const VISUAL_DELTA_ARTIFACT_URL_PREFIX = "/visual-delta-artifacts/";

export type VisualArtifactPaths = {
  baselineRelative: string;
  stemRelative: string;
  actual: string;
  diff: string;
  result: string;
  actualRelative: string;
  diffRelative: string;
  resultRelative: string;
};

function normalizedRelative(directory: string, candidate: string): string {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).includes("..")
  ) {
    throw new Error("Visual artifact baseline must resolve inside snapshotDir");
  }
  return relative.replaceAll(path.sep, "/");
}

export function resolveVisualArtifactRoot(root: string): string {
  return path.resolve(root, VISUAL_DELTA_ARTIFACT_DIR_REL);
}

export function visualArtifactPaths(options: {
  root: string;
  snapshotDir: string;
  baselinePath: string;
}): VisualArtifactPaths {
  const baselineRelative = normalizedRelative(
    options.snapshotDir,
    options.baselinePath,
  );
  if (!/\.png$/i.test(baselineRelative)) {
    throw new Error("Visual artifact baseline must be a PNG");
  }
  const stemRelative = baselineRelative.replace(/\.png$/i, "");
  const artifactRoot = resolveVisualArtifactRoot(options.root);
  const resolveArtifact = (relative: string) =>
    path.resolve(artifactRoot, ...relative.split("/"));
  const actualRelative = `${stemRelative}.actual.png`;
  const diffRelative = `${stemRelative}.diff.png`;
  const resultRelative = `${stemRelative}.result.json`;
  return {
    baselineRelative,
    stemRelative,
    actual: resolveArtifact(actualRelative),
    diff: resolveArtifact(diffRelative),
    result: resolveArtifact(resultRelative),
    actualRelative,
    diffRelative,
    resultRelative,
  };
}

export function visualArtifactPublicUrl(relative: string): string {
  const normalized = path.posix.normalize(relative.replaceAll("\\", "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error("Invalid Visual Delta artifact path");
  }
  return `${VISUAL_DELTA_ARTIFACT_URL_PREFIX}${normalized}`;
}
