import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  VisualEnvironmentCoverage,
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
import type { BaselinePathMode } from "./options.js";
import { snapshotFileName } from "./snapshot-paths.js";
import { isVisualDiffSidecar } from "../visual-diff-sidecar.js";
import {
  visualBaselineEnvironmentKey,
  type VisualBaselineEnvironment,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

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

function uniqueEnvironments(
  environments: readonly VisualBaselineEnvironment[],
): VisualBaselineEnvironment[] {
  const unique = new Map<string, VisualBaselineEnvironment>();
  for (const environment of environments) {
    unique.set(visualBaselineEnvironmentKey(environment), environment);
  }
  return [...unique.values()];
}

export function requiredVisualBaselineEnvironments(
  browsers: readonly VisualDeltaBrowser[],
  availableEnvironments: readonly VisualBaselineEnvironment[],
  runtimePlatform: string,
): VisualBaselineEnvironment[] {
  const platforms = new Set<string>([runtimePlatform]);
  for (const environment of availableEnvironments) {
    platforms.add(environment.platform);
  }
  return browsers.flatMap((browser) =>
    [...platforms].map((platform) => ({ browser, platform })),
  );
}

export function resolveVisualStoryFacts(
  stories: VisualStoryDescriptor[],
  snapshotDir: string,
  baselinePathMode: BaselinePathMode,
  browsers: readonly VisualDeltaBrowser[] = ["chromium"],
  platform = "darwin",
  availableEnvironments: readonly VisualBaselineEnvironment[] = [],
): VisualStoryFact[] {
  const resolvedSnapshotDir = path.resolve(snapshotDir);
  const requiredEnvironments = requiredVisualBaselineEnvironments(
    browsers,
    availableEnvironments,
    platform,
  );
  const relevantEnvironments = uniqueEnvironments([
    ...requiredEnvironments,
    ...availableEnvironments,
  ]);
  return stories.map((story) => {
    try {
      const baselinePathByEnvironment = new Map(
        relevantEnvironments.map((environment) => [
          visualBaselineEnvironmentKey(environment),
          path.resolve(
            resolvedSnapshotDir,
            snapshotFileName(
              story,
              baselinePathMode,
              environment.browser,
              environment.platform,
            ),
          ),
        ]),
      );
      if (
        [...baselinePathByEnvironment.values()].some(
          (baselinePath) =>
            !isInsideDirectory(resolvedSnapshotDir, baselinePath),
        )
      ) {
        throw new Error("Resolved baseline path escapes snapshotDir");
      }
      const environmentCoverage: VisualEnvironmentCoverage[] =
        relevantEnvironments.map((environment) => ({
          ...environment,
          baseline: existsSync(
            baselinePathByEnvironment.get(
              visualBaselineEnvironmentKey(environment),
            )!,
          )
            ? "present"
            : "missing",
        }));
      const baselinePaths = browsers.map(
        (browser) =>
          baselinePathByEnvironment.get(
            visualBaselineEnvironmentKey({ browser, platform }),
          ) ??
          path.resolve(
            resolvedSnapshotDir,
            snapshotFileName(story, baselinePathMode, browser, platform),
          ),
      );
      if (
        baselinePaths.some(
          (baselinePath) =>
            !isInsideDirectory(resolvedSnapshotDir, baselinePath),
        )
      ) {
        throw new Error("Resolved runtime baseline path escapes snapshotDir");
      }
      const baselinePresent = baselinePaths.every(existsSync);
      const baselineHashes = baselinePresent
        ? baselinePaths.map(sha256)
        : [];
      const baselineHash = baselinePresent
        ? baselineHashes.length === 1
          ? baselineHashes[0]
          : createHash("sha256")
              .update(baselineHashes.join("\0"))
              .digest("hex")
        : undefined;
      const matchingSidecars = baselinePresent
        ? baselinePaths.map((baselinePath, index) => {
            const sidecarPath = baselinePath.replace(/\.png$/i, ".json");
            if (!existsSync(sidecarPath)) return null;
            try {
              const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
              return isVisualDiffSidecar(sidecar) &&
                sidecar.baselineHash === baselineHashes[index]
                ? sidecar
                : null;
            } catch {
              return null;
            }
          })
        : [];
      const allResultsMatch =
        matchingSidecars.length === browsers.length &&
        matchingSidecars.every(Boolean);
      const resultBaselineHash = allResultsMatch ? baselineHash : undefined;
      const resultCaptureConfigHash = allResultsMatch
        ? matchingSidecars.length === 1
          ? matchingSidecars[0]?.captureConfigHash
          : createHash("sha256")
              .update(
                matchingSidecars
                  .map((sidecar) => sidecar?.captureConfigHash ?? "")
                  .join("\0"),
              )
              .digest("hex")
        : undefined;
      return {
        storyId: story.id,
        baseline: baselinePresent ? "present" : "missing",
        environmentCoverage,
        ...(baselineHash ? { baselineHash } : {}),
        ...(resultBaselineHash ? { resultBaselineHash } : {}),
        ...(resultCaptureConfigHash ? { resultCaptureConfigHash } : {}),
      };
    } catch {
      return {
        storyId: story.id,
        baseline: "unresolved",
        environmentCoverage: relevantEnvironments.map((environment) => ({
          ...environment,
          baseline: "unresolved",
        })),
      };
    }
  });
}
