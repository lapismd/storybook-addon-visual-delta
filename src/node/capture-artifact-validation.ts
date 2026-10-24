import { assertCapturePathInside } from "./capture-path-safety.js";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { VisualCaptureRunnerResult } from "../runner/index.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import { nativeFileHash } from "./native-write-transaction.js";
import { VISUAL_DELTA_ARTIFACT_DIR_REL as ARTIFACT_DIR_REL } from "./visual-artifacts.js";
function testArtifactKind(
  relativePath: string,
  affectedCacheArtifacts: ReadonlySet<string>,
): "sidecar" | "actual" | "diff" | "affected-cache" | null {
  if (affectedCacheArtifacts.has(relativePath)) return "affected-cache";
  if (
    !(
      relativePath === ARTIFACT_DIR_REL ||
      relativePath.startsWith(`${ARTIFACT_DIR_REL}/`)
    )
  )
    return null;
  if (/\.actual\.png$/i.test(relativePath)) return "actual";
  if (/\.diff\.png$/i.test(relativePath)) return "diff";
  if (/\.result\.json$/i.test(relativePath)) return "sidecar";
  return null;
}

export function validateTestArtifacts(options: {
  stagedArtifactRoot: string;
  artifacts: NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]>;
  profile: VisualCaptureRunnerResult["profile"];
  storyIds: readonly string[];
  browsers: readonly VisualDeltaBrowser[];
  affectedCacheArtifacts: ReadonlySet<string>;
}): void {
  const sidecarBases = new Set<string>();
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    if (
      !relative ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").includes("..")
    ) {
      throw new Error(
        `Unsafe compare-only artifact path: ${artifact.relativePath}`,
      );
    }
    const kind = testArtifactKind(relative, options.affectedCacheArtifacts);
    if (kind === "affected-cache") {
      try {
        const parsed = JSON.parse(
          readFileSync(
            path.resolve(options.stagedArtifactRoot, ...relative.split("/")),
            "utf8",
          ),
        ) as unknown;
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
      } catch {
        throw new Error(
          `Compare-only affected cache is not valid JSON: ${relative}`,
        );
      }
      continue;
    }
    if (kind !== "sidecar") continue;
    const sidecarPath = path.resolve(
      options.stagedArtifactRoot,
      ...relative.split("/"),
    );
    let sidecar: VisualDiffSidecar;
    try {
      sidecar = JSON.parse(
        readFileSync(sidecarPath, "utf8"),
      ) as VisualDiffSidecar;
    } catch {
      throw new Error(
        `Compare-only staged JSON is not a visual sidecar: ${relative}`,
      );
    }
    if (
      sidecar.version !== 4 ||
      typeof sidecar.storyId !== "string" ||
      sidecar.tool !== "playwright"
    ) {
      throw new Error(
        `Compare-only staged JSON is not a visual sidecar: ${relative}`,
      );
    }
    if (
      options.storyIds.length > 0 &&
      !options.storyIds.includes(sidecar.storyId)
    ) {
      throw new Error(
        `Comparison sidecar escaped the frozen story scope: ${relative}`,
      );
    }
    const sidecarBrowser = sidecar.target?.browser ?? sidecar.browser;
    if (
      options.browsers.length > 0 &&
      (!sidecarBrowser || !options.browsers.includes(sidecarBrowser))
    ) {
      throw new Error(
        `Comparison sidecar escaped the frozen browser scope: ${relative}`,
      );
    }
    if (
      !sidecar.captureProfile ||
      !isDeepStrictEqual(sidecar.captureProfile, options.profile)
    ) {
      throw new Error(
        `Comparison sidecar profile does not match the capture runner: ${relative}`,
      );
    }
    const base = relative.replace(/\.result\.json$/i, "");
    const publicBase = base.slice(`${ARTIFACT_DIR_REL}/`.length);
    if (
      (sidecar.actualRel && sidecar.actualRel !== `${publicBase}.actual.png`) ||
      (sidecar.diffRel && sidecar.diffRel !== `${publicBase}.diff.png`)
    ) {
      throw new Error(
        `Comparison sidecar diagnostic paths do not match its result: ${relative}`,
      );
    }
    sidecarBases.add(base);
  }
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    const kind = testArtifactKind(relative, options.affectedCacheArtifacts);
    if (!kind) {
      throw new Error(
        `Compare-only runner returned a forbidden artifact: ${relative}`,
      );
    }
    if (kind === "actual" || kind === "diff") {
      const base = relative.replace(/\.(?:actual|diff)\.png$/i, "");
      if (!sidecarBases.has(base)) {
        throw new Error(
          `Compare-only diagnostic has no matching sidecar: ${relative}`,
        );
      }
    }
  }
}

export function applyStagedArtifacts(options: {
  root: string;
  stagedArtifactRoot: string;
  artifacts: NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]>;
}): void {
  const root = path.resolve(options.root);
  const stagedRoot = path.resolve(options.stagedArtifactRoot);
  const prepared: Array<{ source: string; destination: string }> = [];
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    if (
      !relative ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").includes("..")
    ) {
      throw new Error(`Unsafe staged artifact path: ${artifact.relativePath}`);
    }
    const source = path.resolve(stagedRoot, ...relative.split("/"));
    if (
      artifact.originalSha256 !== undefined &&
      nativeFileHash(path.resolve(root, ...relative.split("/"))) !==
        artifact.originalSha256
    ) {
      throw new Error(
        `Capture destination changed during the run: ${relative}`,
      );
    }
    const destination = path.resolve(root, ...relative.split("/"));
    if (
      !source.startsWith(`${stagedRoot}${path.sep}`) ||
      !destination.startsWith(`${root}${path.sep}`)
    ) {
      throw new Error(`Staged artifact escapes its approved root: ${relative}`);
    }
    assertCapturePathInside(stagedRoot, source);
    assertCapturePathInside(root, destination);
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Staged artifact must be a regular file: ${relative}`);
    }
    const actualHash = createHash("sha256")
      .update(readFileSync(source))
      .digest("hex");
    const expectedHash = artifact.sha256.replace(/^sha256:/, "");
    if (actualHash !== expectedHash) {
      throw new Error(`Staged artifact checksum mismatch: ${relative}`);
    }
    prepared.push({ source, destination });
  }
  for (const { source, destination } of prepared) {
    mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    copyFileSync(source, temporary);
    renameSync(temporary, destination);
  }
}
