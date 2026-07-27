import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
import type { BaselinePathMode } from "./options.js";
import { snapshotFileName } from "./snapshot-paths.js";
import { isVisualDiffSidecar } from "../visual-diff-sidecar.js";

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isInsideDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function resolveVisualStoryFacts(
  stories: VisualStoryDescriptor[],
  snapshotDir: string,
  baselinePathMode: BaselinePathMode,
): VisualStoryFact[] {
  const resolvedSnapshotDir = path.resolve(snapshotDir);
  return stories.map((story) => {
    try {
      const relativePath = snapshotFileName(
        story,
        baselinePathMode,
        "chromium",
        "darwin",
      );
      const baselinePath = path.resolve(resolvedSnapshotDir, relativePath);
      if (!isInsideDirectory(resolvedSnapshotDir, baselinePath)) {
        return { storyId: story.id, baseline: "unresolved" };
      }
      const baselinePresent = existsSync(baselinePath);
      const baselineHash = baselinePresent ? sha256(baselinePath) : undefined;
      const sidecarPath = baselinePath.replace(/\.png$/i, ".json");
      let resultBaselineHash: string | undefined;
      let resultCaptureConfigHash: string | undefined;
      if (baselineHash && existsSync(sidecarPath)) {
        try {
          const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
          if (
            isVisualDiffSidecar(sidecar) &&
            sidecar.baselineHash === baselineHash
          ) {
            resultBaselineHash = sidecar.baselineHash;
            resultCaptureConfigHash = sidecar.captureConfigHash;
          }
        } catch {
          /* malformed or stale evidence is intentionally omitted */
        }
      }
      return {
        storyId: story.id,
        baseline: baselinePresent ? "present" : "missing",
        ...(baselineHash ? { baselineHash } : {}),
        ...(resultBaselineHash ? { resultBaselineHash } : {}),
        ...(resultCaptureConfigHash ? { resultCaptureConfigHash } : {}),
      };
    } catch {
      return { storyId: story.id, baseline: "unresolved" };
    }
  });
}
