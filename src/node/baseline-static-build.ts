import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { BaselinePathMode } from "./options.js";
import { decideStorybookStaticBuild } from "./static-build.js";
import { visualCanonicalBuildFingerprint } from "./affected-visual-tests.js";
import {
  persistCanonicalBuildCache,
  resolveCanonicalBuildCacheRoot,
  restoreCanonicalBuildCache,
  publishProfilePreviewGraph,
} from "./canonical-build-cache.js";
export function ensureStorybookStatic(
  root: string,
  options: {
    skipBuild?: boolean;
    forceRebuild?: boolean;
    forceReason?: "unskip" | "explicit-rebuild";
    storyIds?: string[];
    component?: string;
    snapshotDir?: string;
    baselinePathMode?: BaselinePathMode;
  } = {},
): void {
  const hostOptions = {
    snapshotDir: options.snapshotDir,
    baselinePathMode: options.baselinePathMode,
  };
  const cacheRoot = resolveCanonicalBuildCacheRoot(root);
  const fingerprint = visualCanonicalBuildFingerprint(root, hostOptions);
  const restored = restoreCanonicalBuildCache({
    root,
    cacheRoot,
    fingerprint,
    forceRebuild: options.forceRebuild,
  });
  if (restored.restored) {
    publishProfilePreviewGraph(root);
    return;
  }
  const decision = decideStorybookStaticBuild({
    packageRoot: root,
    skipBuild: Boolean(options.skipBuild),
    forceRebuild: options.forceRebuild,
    forceReason: options.forceReason,
    storyIdPrefix: options.component ?? "",
    storyIds: options.storyIds,
  });
  if (decision.reason === "skip-build-missing") {
    throw new Error(decision.message);
  }
  if (!decision.shouldBuild) return;
  execFileSync("pnpm", ["build-storybook"], {
    cwd: root,
    stdio: "inherit",
  });
  if (
    !existsSync(path.join(root, "storybook-static", "index.json")) ||
    !existsSync(path.join(root, "storybook-static", "iframe.html"))
  ) {
    throw new Error(
      "build-storybook did not produce a complete storybook-static (index.json + iframe.html)",
    );
  }
  publishProfilePreviewGraph(root);
  persistCanonicalBuildCache({
    root,
    cacheRoot,
    fingerprint: visualCanonicalBuildFingerprint(root, hostOptions),
  });
}
