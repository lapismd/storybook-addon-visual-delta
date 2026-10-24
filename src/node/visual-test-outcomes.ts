import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import {
  isVisualDiffSidecar,
  type VisualDiffSidecar,
} from "../visual-diff-sidecar.js";
import { resolveBaselinePathMode } from "./options.js";
import {
  loadSidecarForStoryId,
  loadModeSidecarsForStoryId,
  loadStoryIndex,
} from "./visual-sidecars.js";
import { snapshotFileName } from "./snapshot-paths.js";
import { visualArtifactPaths } from "./visual-artifacts.js";
function readInteractionResult(
  options: Parameters<typeof policyPassingStoryIds>[0],
  browser: VisualDeltaBrowser,
): VisualDiffSidecar | null {
  try {
    const interaction = options.interaction!;
    const entry = loadStoryIndex(options.root)[interaction.storyId];
    if (!entry) return null;
    const name = snapshotFileName(
      entry,
      options.baselinePathMode,
      browser,
    ).replace(`-${browser}.png`, `--${interaction.stepId}-${browser}.png`);
    const baselinePath = path.join(options.snapshotDir, name);
    const value = JSON.parse(
      readFileSync(
        visualArtifactPaths({ ...options, baselinePath }).result,
        "utf8",
      ),
    ) as unknown;
    if (
      !isVisualDiffSidecar(value) ||
      value.variant?.kind !== "interaction" ||
      value.variant.id !== interaction.stepId ||
      value.storyId !== interaction.storyId ||
      value.target?.browser !== browser
    )
      return null;
    return value.baselineHash ===
      createHash("sha256").update(readFileSync(baselinePath)).digest("hex")
      ? value
      : null;
  } catch {
    return null;
  }
}
function variantKey(sidecar: {
  variant?: { kind: string; id?: string };
  mode?: string;
}): string {
  if (sidecar.variant?.kind === "mode") {
    return `mode:${sidecar.variant.id ?? sidecar.mode ?? ""}`;
  }
  if (sidecar.variant?.kind === "interaction") {
    return `interaction:${sidecar.variant.id ?? ""}`;
  }
  return sidecar.mode ? `mode:${sidecar.mode}` : "primary";
}

export function policyPassingStoryIds(options: {
  root: string;
  snapshotDir: string;
  baselinePathMode: ReturnType<typeof resolveBaselinePathMode>;
  storyIds: readonly string[];
  browsers: readonly VisualDeltaBrowser[];
  interaction?: { storyId: string; stepId: string };
}): { passing: string[]; strictFailure: boolean } {
  let strictFailure = false;
  const passing = options.storyIds.filter((storyId) =>
    options.browsers.every((browser) => {
      const primary = options.interaction
        ? readInteractionResult(options, browser)
        : loadSidecarForStoryId(
            storyId,
            options.root,
            options.snapshotDir,
            options.baselinePathMode,
            browser,
          );
      if (!primary) {
        strictFailure = true;
        return false;
      }
      const sidecars = [
        primary,
        ...(options.interaction
          ? []
          : loadModeSidecarsForStoryId(
              storyId,
              options.root,
              options.snapshotDir,
              options.baselinePathMode,
              browser,
            )),
      ];
      const actualVariants = new Set(sidecars.map(variantKey));
      const expectedVariants = new Set(
        (primary.captureSet ?? []).map((item) => variantKey(item)),
      );
      const complete =
        expectedVariants.size === 0 ||
        [...expectedVariants].every((variant) => actualVariants.has(variant));
      const failed = sidecars.some(
        (sidecar) =>
          sidecar.policyStatus === "failed" ||
          sidecar.outcome === "error" ||
          sidecar.passed === false,
      );
      if (failed || !complete) strictFailure = true;
      return (
        complete &&
        sidecars.every(
          (sidecar) =>
            sidecar.passed === true && sidecar.policyStatus === "passed",
        )
      );
    }),
  );
  return { passing, strictFailure };
}
