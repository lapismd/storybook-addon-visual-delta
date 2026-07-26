import { existsSync } from "node:fs";
import path from "node:path";
import type {
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
import type { BaselinePathMode } from "./options.js";
import { snapshotFileName } from "./snapshot-paths.js";

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
      return {
        storyId: story.id,
        baseline: existsSync(baselinePath) ? "present" : "missing",
      };
    } catch {
      return { storyId: story.id, baseline: "unresolved" };
    }
  });
}
