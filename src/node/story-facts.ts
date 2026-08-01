import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  VisualBrowserCoverage,
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
import type { BaselinePathMode } from "./options.js";
import { snapshotFileName } from "./snapshot-paths.js";
import { isVisualDiffSidecar } from "../visual-diff-sidecar.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";

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

function uniqueBrowsers(
  browsers: readonly VisualDeltaBrowser[],
): VisualDeltaBrowser[] {
  return [...new Set(browsers)];
}

export function requiredVisualBaselineBrowsers(
  browsers: readonly VisualDeltaBrowser[],
): VisualDeltaBrowser[] {
  return uniqueBrowsers(browsers);
}

export function resolveVisualStoryFacts(
  stories: VisualStoryDescriptor[],
  snapshotDir: string,
  baselinePathMode: BaselinePathMode,
  browsers: readonly VisualDeltaBrowser[] = ["chromium"],
  availableBrowsers: readonly VisualDeltaBrowser[] = [],
): VisualStoryFact[] {
  const resolvedSnapshotDir = path.resolve(snapshotDir);
  const requiredBrowsers = requiredVisualBaselineBrowsers(browsers);
  const relevantBrowsers = uniqueBrowsers([
    ...requiredBrowsers,
    ...availableBrowsers,
  ]);

  return stories.map((story) => {
    try {
      const baselinePathByBrowser = new Map(
        relevantBrowsers.map((browser) => [
          browser,
          path.resolve(
            resolvedSnapshotDir,
            snapshotFileName(story, baselinePathMode, browser),
          ),
        ]),
      );
      if (
        [...baselinePathByBrowser.values()].some(
          (baselinePath) =>
            !isInsideDirectory(resolvedSnapshotDir, baselinePath),
        )
      ) {
        throw new Error("Resolved baseline path escapes snapshotDir");
      }

      const browserCoverage: VisualBrowserCoverage[] = relevantBrowsers.map(
        (browser) => ({
          target: { browser },
          browser,
          baseline: existsSync(baselinePathByBrowser.get(browser)!)
            ? "present"
            : "missing",
        }),
      );
      const baselinePaths = requiredBrowsers.map(
        (browser) => baselinePathByBrowser.get(browser)!,
      );
      const baselinePresent = baselinePaths.every(existsSync);
      const baselineHashes = baselinePresent ? baselinePaths.map(sha256) : [];
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
        matchingSidecars.length === requiredBrowsers.length &&
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
        browserCoverage,
        ...(baselineHash ? { baselineHash } : {}),
        ...(resultBaselineHash ? { resultBaselineHash } : {}),
        ...(resultCaptureConfigHash ? { resultCaptureConfigHash } : {}),
      };
    } catch {
      return {
        storyId: story.id,
        baseline: "unresolved",
        browserCoverage: relevantBrowsers.map((browser) => ({
          target: { browser },
          browser,
          baseline: "unresolved",
        })),
      };
    }
  });
}
