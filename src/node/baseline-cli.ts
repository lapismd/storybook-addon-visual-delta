import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  captureInteractionWithCreateVerification,
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
  invalidateVisualResultArtifacts,
  loadStoryIndex,
  syncStaticIndexSkipVisual,
} from "./visual-sidecars.js";
import { playwrightStoryIdGrep } from "./story-id-grep.js";
import { decideStorybookStaticBuild } from "./static-build.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

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
  captureCallId?: string;
  /** Exact Playwright browser project. Defaults to Chromium. */
  browser?: VisualDeltaBrowser;
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

function browserOf(options: BaselineCliOptions, root: string): VisualDeltaBrowser {
  const browser = options.browser ?? "chromium";
  const projectConfig = readVisualDeltaProjectConfig(root);
  const configErrors = projectConfig.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configErrors.length > 0) {
    throw new Error(configErrors.map((diagnostic) => diagnostic.message).join(" "));
  }
  const enabled = projectConfig.browsers;
  if (!enabled.includes(browser)) {
    throw new Error(
      `Browser ${browser} is not enabled in .visual-delta/config.json.`,
    );
  }
  return browser;
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
  options: {
    skipBuild?: boolean;
    forceRebuild?: boolean;
    forceReason?: "unskip" | "explicit-rebuild";
    storyIds?: string[];
    component?: string;
  } = {},
): void {
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
  browser: VisualDeltaBrowser,
  platform: string,
): string {
  return snapshotFileName(entry, mode, browser, platform).replace(
    `-${browser}-${platform}.png`,
    `--${stepId}-${browser}-${platform}.png`,
  );
}

/**
 * Create missing or overwrite primary baselines via Playwright, then wire CSF
 * `parameters.visualDelta.images` and stamp `visual-pending` (clears ready /
 * approved / failed). A later explicit comparison may move it to ready.
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
  const browser = browserOf(options, root);
  const mode = pathModeOf(options);
  const snapshotDir = snapshotDirOf(options, root);
  const port = resolveVisualServerPort(options);
  let unskipped = false;

  if (options.createOnly) {
    const matched = matchingEntries(root, storyIds, component);
    for (const entry of matched) {
      if ((entry.tags ?? []).includes("skip-visual")) {
        const patched = patchStorySkipVisual({
          packageRoot: root,
          storyId: entry.id,
          skip: false,
        });
        unskipped ||= patched.ok;
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
    forceRebuild: options.forceRebuild || unskipped,
    forceReason: unskipped ? "unskip" : "explicit-rebuild",
    storyIds: storyIds.length ? storyIds : undefined,
    component,
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
          !existsSync(
            path.join(
              snapshotDir,
              snapshotFileName(entry, mode, browser, process.platform),
            ),
          ),
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
    ...(options.createOnly ? { VISUAL_DELTA_FAILURE_MODE: "warn" } : {}),
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
        "--project",
        browser,
        ...(grep ? ["-g", grep] : []),
      ],
      { cwd: root, stdio: "inherit", env },
    );
  } catch (error) {
    invalidateVisualResultArtifacts({
      packageRoot: root,
      snapshotDir,
      mode,
      storyIds: targets.map((entry) => entry.id),
    });
    throw error;
  }

  invalidateVisualResultArtifacts({
    packageRoot: root,
    snapshotDir,
    mode,
    storyIds: targets.map((entry) => entry.id),
  });

  for (const entry of targets) {
    const png = path.join(
      snapshotDir,
      snapshotFileName(entry, mode, browser, process.platform),
    );
    if (!existsSync(png)) continue;
    const url = baselinePublicUrl(
      entry,
      mode,
      undefined,
      browser,
      process.platform,
    );
    patchStoryBaselineImages({
      packageRoot: root,
      storyId: entry.id,
      url,
      reviewStatus: "pending",
    });
  }

  if (options.createOnly && needingCreate.length) {
    const stillMissing = needingCreate.filter(
      (entry) =>
        !existsSync(
          path.join(
            snapshotDir,
            snapshotFileName(entry, mode, browser, process.platform),
          ),
        ),
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
  const browser = browserOf(options, root);
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
    interactionSnapshotFileName(
      entry,
      stepId,
      mode,
      browser,
      process.platform,
    ),
  );
  const publicRel = path
    .relative(snapshotDir, interactionPng)
    .replaceAll(path.sep, "/");
  const src = `/visual-baselines/${publicRel}`;
  const fallbackInteractionPng = path.join(
    snapshotDir,
    interactionScreenshotRelativePath(
      screenshotRelativePath(entry, mode),
      stepId,
    ).replace(/\.png$/i, `-${browser}-${process.platform}.png`),
  );
  const interactionPngExists = () =>
    existsSync(interactionPng) || existsSync(fallbackInteractionPng);

  if (options.createOnly && interactionPngExists()) {
    patchStoryInteraction({
      packageRoot: root,
      storyId,
      interaction: { id: stepId, label: stepLabel, src },
    });
    return;
  }

  const warmInteraction = await ensureWarmStaticStorybookServer(root, port);
  if (!warmInteraction.ok) await ensurePlaywrightWebServerPort(port);

  const capture = JSON.stringify({
    storyId,
    stepId,
    stepLabel,
    captureCallId: options.captureCallId?.trim() || undefined,
  });
  captureInteractionWithCreateVerification({
    createOnly: options.createOnly,
    baselineExists: interactionPngExists,
    capture: (updateMode) => {
      execFileSync(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          `--update-snapshots=${updateMode}`,
          "--project",
          browser,
        ],
        {
          cwd: root,
          stdio: "inherit",
          env: {
            ...process.env,
            PLAYWRIGHT_INTERACTION_CAPTURE: capture,
            PLAYWRIGHT_UPDATE_SNAPSHOTS: updateMode === "none" ? "0" : "1",
            PLAYWRIGHT_UPDATE_MODE: updateMode,
            VISUAL_UPDATE_APPROVED: "1",
            VISUAL_DELTA_BASELINE_PATH_MODE: mode,
            VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
          },
        },
      );
    },
  });

  if (!interactionPngExists()) {
    throw new Error(
      `Interaction PNG was not written for ${storyId} / ${stepId}`,
    );
  }

  invalidateVisualResultArtifacts({
    packageRoot: root,
    snapshotDir,
    mode,
    storyIds: [storyId],
  });

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
