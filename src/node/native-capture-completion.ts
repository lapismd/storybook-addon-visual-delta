import path from "node:path";
import type {
  VisualCaptureJobManifest,
  VisualCaptureRunnerResult,
} from "../runner/index.js";
import { captureSnapshotDir } from "./capture-configuration.js";
import { snapshotFileName } from "./snapshot-paths.js";
import {
  invalidateVisualResultArtifacts,
  loadStoryIndex,
} from "./visual-sidecars.js";
import { VISUAL_DELTA_BROWSERS } from "../shared/environments.js";

/** Invalidate original evidence only after the staged mutation has succeeded. */
export function completeNativeCapture(
  root: string,
  manifest: VisualCaptureJobManifest,
  result: VisualCaptureRunnerResult,
): void {
  if (manifest.operation === "test" || result.exitCode !== 0) return;
  const argument = (name: string) => {
    const index = manifest.argv.lastIndexOf(name);
    return index < 0 ? undefined : manifest.argv[index + 1];
  };
  const snapshotDir = captureSnapshotDir(root, argument("--snapshot-dir"));
  const mode =
    argument("--baseline-path-mode") === "nested-import"
      ? "nested-import"
      : "story-id";
  const written = new Set(
    (result.stagedArtifacts ?? []).map((artifact) =>
      path.resolve(root, artifact.relativePath),
    ),
  );
  const storyIds = Object.values(loadStoryIndex(root))
    .filter(
      (entry) =>
        (entry.type === "story" || !entry.type) &&
        (!manifest.storyIds.length || manifest.storyIds.includes(entry.id)),
    )
    .filter((entry) =>
      VISUAL_DELTA_BROWSERS.some((browser) => {
        const primary = path.join(
          snapshotDir,
          snapshotFileName(entry, mode, browser),
        );
        const stem = path
          .basename(primary)
          .slice(0, `-${browser}.png`.length * -1);
        return [...written].some(
          (file) =>
            path.dirname(file) === path.dirname(primary) &&
            (file === primary ||
              (path.basename(file).startsWith(`${stem}--`) &&
                file.endsWith(`-${browser}.png`))),
        );
      }),
    )
    .map((entry) => entry.id);
  if (storyIds.length)
    invalidateVisualResultArtifacts({
      packageRoot: root,
      snapshotDir,
      mode,
      storyIds,
    });
}
