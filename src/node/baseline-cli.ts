import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  interactionScreenshotRelativePath,
  slugifyStepLabel,
} from "../shared/interaction-capture.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_SNAPSHOT_DIR,
  resolveVisualServerPort,
  type BaselinePathMode,
} from "./options.js";
import {
  baselinePublicUrl,
  screenshotRelativePath,
  snapshotFileName,
  type StoryIndexEntry,
} from "./snapshot-paths.js";
import {
  patchStoryBaselineImages,
  patchStoryInteraction,
  patchStorySkipVisual,
} from "./story-source.js";
import {
  ensurePlaywrightWebServerPort,
  ensureWarmStaticStorybookServer,
} from "./visual-server.js";
import {
  loadStoryIndex,
  syncStaticIndexSkipVisual,
} from "./visual-sidecars.js";
import { playwrightStoryIdGrep } from "./story-id-grep.js";

export type BaselineCliOptions = {
  packageRoot?: string;
  snapshotDir?: string;
  baselinePathMode?: BaselinePathMode;
  visualServerPort?: number;
  /** Exact story ids to update in one Playwright invocation. */
  storyIds?: string[];
  /** Legacy single-story input. */
  storyId?: string;
  /** Explicit component input; the only operation allowed to use broad matching. */
  component?: string;
  approved?: boolean;
  allowDirty?: boolean;
  skipBuild?: boolean;
  /** Force `build-storybook` even when storybook-static is complete. */
  forceRebuild?: boolean;
  createOnly?: boolean;
  stepLabel?: string;
  stepId?: string;
};

function packageRootOf(options: BaselineCliOptions): string {
  return options.packageRoot?.trim() || process.cwd();
}

function snapshotDirOf(options: BaselineCliOptions, root: string): string {
  const configured = options.snapshotDir?.trim();
  if (!configured) return path.join(root, DEFAULT_SNAPSHOT_DIR);
  return configured.startsWith("/") ? configured : path.join(root, configured);
}

function pathModeOf(options: BaselineCliOptions): BaselinePathMode {
  return options.baselinePathMode ?? DEFAULT_BASELINE_PATH_MODE;
}

function assertApproved(options: BaselineCliOptions, verb: string): void {
  const approved =
    options.approved || process.env.VISUAL_UPDATE_APPROVED === "1";
  if (!approved) {
    throw new Error(
      `Set VISUAL_UPDATE_APPROVED=1 (or pass --approved) to ${verb}`,
    );
  }
}

function ensureStorybookStatic(
  root: string,
  options: { skipBuild?: boolean; forceRebuild?: boolean } = {},
): void {
  const indexPath = path.join(root, "storybook-static", "index.json");
  const iframePath = path.join(root, "storybook-static", "iframe.html");
  const complete = existsSync(indexPath) && existsSync(iframePath);
  const { skipBuild, forceRebuild } = options;

  // Playwright captures against storybook-static, not live Storybook.
  // --skip-build reuses a complete tree; --rebuild forces build-storybook.
  if (complete && !forceRebuild) return;
  if (skipBuild && !forceRebuild) {
    throw new Error(
      !existsSync(indexPath)
        ? "storybook-static/index.json missing — run build-storybook first"
        : "storybook-static incomplete (missing iframe.html) — run build-storybook",
    );
  }

  execFileSync("pnpm", ["build-storybook"], {
    cwd: root,
    stdio: "inherit",
  });
  if (!existsSync(indexPath) || !existsSync(iframePath)) {
    throw new Error(
      "build-storybook did not produce a complete storybook-static (index.json + iframe.html)",
    );
  }
}

function matchingEntries(
  root: string,
  storyIds: string[],
  component: string | undefined,
): StoryIndexEntry[] {
  const entries = Object.values(loadStoryIndex(root)).filter(
    (entry) => entry.type === "story" || !entry.type,
  );
  if (storyIds.length) {
    const wanted = new Set(storyIds);
    return entries.filter((entry) => wanted.has(entry.id));
  }
  if (component) {
    const needle = component.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.id.toLowerCase().includes(needle) ||
        (entry.title ?? "").toLowerCase().includes(needle),
    );
  }
  return [];
}

function playwrightGrep(
  storyIds: string[],
  component: string | undefined,
): string {
  if (storyIds.length) {
    return playwrightStoryIdGrep(storyIds)!;
  }
  return component?.trim() || "";
}

function interactionSnapshotFileName(
  entry: StoryIndexEntry,
  stepId: string,
  mode: BaselinePathMode,
): string {
  return snapshotFileName(entry, mode).replace(
    /-chromium-([a-z0-9]+)\.png$/i,
    `--${stepId}-chromium-$1.png`,
  );
}

/**
 * Create missing or overwrite primary baselines via Playwright, then wire CSF
 * `parameters.visualDelta.images` and stamp `visual-ready` (clears pending /
 * approved / failed).
 */
export async function runBaselineUpdate(
  options: BaselineCliOptions,
): Promise<void> {
  const storyIds = [
    ...new Set(
      [...(options.storyIds ?? []), options.storyId ?? ""]
        .map((storyId) => storyId.trim())
        .filter(Boolean),
    ),
  ];
  const component = options.component?.trim();
  if (!storyIds.length && !component) {
    throw new Error("visual-delta update requires --story-id or --component");
  }
  assertApproved(
    options,
    options.createOnly ? "create baselines" : "update baselines",
  );

  const root = packageRootOf(options);
  const mode = pathModeOf(options);
  const snapshotDir = snapshotDirOf(options, root);
  const port = resolveVisualServerPort(options);

  if (options.createOnly) {
    const matched = matchingEntries(root, storyIds, component);
    for (const entry of matched) {
      if ((entry.tags ?? []).includes("skip-visual")) {
        patchStorySkipVisual({
          packageRoot: root,
          storyId: entry.id,
          skip: false,
        });
      }
    }
    // Playwright loads stories from storybook-static/index.json. With
    // --skip-build, CSF tag edits alone leave the suite empty ("No tests found").
    syncStaticIndexSkipVisual(
      root,
      matched.map((entry) => entry.id),
      false,
    );
  }

  ensureStorybookStatic(root, {
    skipBuild: options.skipBuild,
    forceRebuild: options.forceRebuild,
  });
  const warm = await ensureWarmStaticStorybookServer(root, port);
  if (!warm.ok) await ensurePlaywrightWebServerPort(port);

  const targets = matchingEntries(root, storyIds, component).filter(
    (entry) => !(entry.tags ?? []).includes("skip-visual"),
  );
  if (!targets.length) {
    throw new Error(
      `No runnable visual stories for ${storyIds.join(", ") || component} (all skip-visual or missing from index)`,
    );
  }

  const needingCreate = options.createOnly
    ? targets.filter(
        (entry) =>
          !existsSync(path.join(snapshotDir, snapshotFileName(entry, mode))),
      )
    : [];

  const grep = playwrightGrep(storyIds, component);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_UPDATE_SNAPSHOTS: "1",
    VISUAL_UPDATE_APPROVED: "1",
    ...(options.createOnly ? { PLAYWRIGHT_UPDATE_MODE: "missing" } : {}),
    VISUAL_DELTA_BASELINE_PATH_MODE: mode,
    VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
  };

  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        // Explicit mode — bare `--update-snapshots` means "all" and overrides config.
        `--update-snapshots=${options.createOnly ? "missing" : "all"}`,
        ...(grep ? ["-g", grep] : []),
      ],
      { cwd: root, stdio: "inherit", env },
    );
  } catch (error) {
    // Create-only can exit non-zero when existing baselines still mismatch.
    if (!options.createOnly) throw error;
  }

  for (const entry of targets) {
    const png = path.join(snapshotDir, snapshotFileName(entry, mode));
    if (!existsSync(png)) continue;
    const url = baselinePublicUrl(entry, mode);
    patchStoryBaselineImages({
      packageRoot: root,
      storyId: entry.id,
      url,
      reviewStatus: "ready",
    });
  }

  if (options.createOnly && needingCreate.length) {
    const stillMissing = needingCreate.filter(
      (entry) =>
        !existsSync(path.join(snapshotDir, snapshotFileName(entry, mode))),
    );
    if (stillMissing.length) {
      throw new Error(
        `Create failed — no baseline PNG written for: ${stillMissing
          .map((entry) => entry.id)
          .join(", ")}`,
      );
    }
  }
}

/**
 * Capture one mid-play interaction baseline (requires a suite that honors
 * `PLAYWRIGHT_INTERACTION_CAPTURE`, e.g. defineVisualSuite).
 */
export async function runInteractionUpdate(
  options: BaselineCliOptions,
): Promise<void> {
  const storyId = options.storyId?.trim();
  const stepLabel = options.stepLabel?.trim();
  if (!storyId || !stepLabel) {
    throw new Error(
      "visual-delta interaction-update requires --story-id and --step-label",
    );
  }
  assertApproved(options, "write interaction baselines");

  const root = packageRootOf(options);
  const mode = pathModeOf(options);
  const snapshotDir = snapshotDirOf(options, root);
  const port = resolveVisualServerPort(options);
  const stepId = (options.stepId ?? slugifyStepLabel(stepLabel)).trim();

  ensureStorybookStatic(root, {
    skipBuild: options.skipBuild,
    forceRebuild: options.forceRebuild,
  });

  const entry = loadStoryIndex(root)[storyId];
  if (!entry) {
    throw new Error(`Story not found in index: ${storyId}`);
  }
  if ((entry.tags ?? []).includes("skip-visual")) {
    throw new Error(`${storyId} is skip-visual`);
  }

  const interactionPng = path.join(
    snapshotDir,
    interactionSnapshotFileName(entry, stepId, mode),
  );
  const publicRel = path
    .relative(snapshotDir, interactionPng)
    .replaceAll(path.sep, "/");
  const src = `/visual-baselines/${publicRel}`;

  if (options.createOnly && existsSync(interactionPng)) {
    patchStoryInteraction({
      packageRoot: root,
      storyId,
      interaction: { id: stepId, label: stepLabel, src },
    });
    return;
  }

  const warmInteraction = await ensureWarmStaticStorybookServer(root, port);
  if (!warmInteraction.ok) await ensurePlaywrightWebServerPort(port);

  const capture = JSON.stringify({ storyId, stepId, stepLabel });
  execFileSync("pnpm", ["exec", "playwright", "test"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_INTERACTION_CAPTURE: capture,
      PLAYWRIGHT_UPDATE_SNAPSHOTS: "1",
      VISUAL_UPDATE_APPROVED: "1",
      VISUAL_DELTA_BASELINE_PATH_MODE: mode,
      VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
    },
  });

  if (!existsSync(interactionPng)) {
    // Fallback: Playwright may write the toHaveScreenshot relative name + suffix.
    const rel = interactionScreenshotRelativePath(
      screenshotRelativePath(entry, mode),
      stepId,
    );
    const alt = path.join(
      snapshotDir,
      rel.replace(/\.png$/i, "-chromium-darwin.png"),
    );
    if (!existsSync(alt)) {
      throw new Error(
        `Interaction PNG was not written for ${storyId} / ${stepId}`,
      );
    }
  }

  patchStoryInteraction({
    packageRoot: root,
    storyId,
    interaction: { id: stepId, label: stepLabel, src },
  });
}

/**
 * Add or remove `skip-visual` on matching stories (packaged CLI).
 * Requires `storybook-static/index.json` for story → source resolution.
 */
export function runSkipVisualTag(
  options: BaselineCliOptions & {
    /** `true` = add skip-visual; `false` = remove it. */
    skip: boolean;
  },
): { updated: string[]; errors: string[] } {
  const root = packageRootOf(options);
  ensureStorybookStatic(root, { skipBuild: true });
  const targets = matchingEntries(
    root,
    [...(options.storyIds ?? []), options.storyId ?? ""]
      .map((storyId) => storyId.trim())
      .filter(Boolean),
    options.component,
  );
  if (!targets.length) {
    throw new Error(
      "Provide --story-id <id> or --component <name> matching at least one story in storybook-static/index.json",
    );
  }
  const updated: string[] = [];
  const errors: string[] = [];
  for (const entry of targets) {
    const result = patchStorySkipVisual({
      packageRoot: root,
      storyId: entry.id,
      skip: options.skip,
    });
    if (result.ok) updated.push(entry.id);
    else errors.push(`${entry.id}: ${result.error ?? "patch failed"}`);
  }
  if (updated.length) {
    syncStaticIndexSkipVisual(root, updated, options.skip);
  }
  if (!updated.length && errors.length) {
    throw new Error(errors.join("\n"));
  }
  return { updated, errors };
}
