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
  DEFAULT_VISUAL_SERVER_PORT,
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
  patchStoryVisualReviewStatus,
} from "./story-source.js";
import { ensurePlaywrightWebServerPort } from "./visual-server.js";
import { loadStoryIndex } from "./visual-sidecars.js";

export type BaselineCliOptions = {
  packageRoot?: string;
  snapshotDir?: string;
  baselinePathMode?: BaselinePathMode;
  visualServerPort?: number;
  storyId?: string;
  /** Used as Playwright `-g` when storyId is absent. */
  component?: string;
  approved?: boolean;
  allowDirty?: boolean;
  skipBuild?: boolean;
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
  return configured.startsWith("/")
    ? configured
    : path.join(root, configured);
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
  skipBuild: boolean | undefined,
): void {
  const indexPath = path.join(root, "storybook-static", "index.json");
  if (existsSync(indexPath)) return;
  if (skipBuild) {
    throw new Error(
      "storybook-static/index.json missing — run build-storybook first",
    );
  }
  execFileSync("pnpm", ["build-storybook"], {
    cwd: root,
    stdio: "inherit",
  });
  if (!existsSync(indexPath)) {
    throw new Error(
      "build-storybook did not produce storybook-static/index.json",
    );
  }
}

function matchingEntries(
  root: string,
  storyId: string | undefined,
  component: string | undefined,
): StoryIndexEntry[] {
  const entries = Object.values(loadStoryIndex(root)).filter(
    (entry) => entry.type === "story" || !entry.type,
  );
  if (storyId) {
    const exact = entries.filter((entry) => entry.id === storyId);
    if (exact.length) return exact;
    return entries.filter((entry) => entry.id.startsWith(storyId));
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
  storyId: string | undefined,
  component: string | undefined,
): string {
  if (storyId) {
    return `${storyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
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
 * `parameters.visualDelta.images` and stamp `visual-pending`.
 */
export async function runBaselineUpdate(
  options: BaselineCliOptions,
): Promise<void> {
  const storyId = options.storyId?.trim();
  const component = options.component?.trim();
  if (!storyId && !component) {
    throw new Error("visual-delta update requires --story-id or --component");
  }
  assertApproved(
    options,
    options.createOnly ? "create baselines" : "update baselines",
  );

  const root = packageRootOf(options);
  const mode = pathModeOf(options);
  const snapshotDir = snapshotDirOf(options, root);
  const port = options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT;

  if (options.createOnly) {
    for (const entry of matchingEntries(root, storyId, component)) {
      if ((entry.tags ?? []).includes("skip-visual")) {
        patchStorySkipVisual({
          packageRoot: root,
          storyId: entry.id,
          skip: false,
        });
      }
    }
  }

  ensureStorybookStatic(root, options.skipBuild);
  await ensurePlaywrightWebServerPort(port);

  const grep = playwrightGrep(storyId, component);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_UPDATE_SNAPSHOTS: "1",
    VISUAL_UPDATE_APPROVED: "1",
    ...(options.createOnly ? { PLAYWRIGHT_UPDATE_MODE: "missing" } : {}),
    VISUAL_DELTA_BASELINE_PATH_MODE: mode,
    VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
  };

  execFileSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--update-snapshots",
      ...(grep ? ["-g", grep] : []),
    ],
    { cwd: root, stdio: "inherit", env },
  );

  const targets = matchingEntries(root, storyId, component).filter(
    (entry) => !(entry.tags ?? []).includes("skip-visual"),
  );
  for (const entry of targets) {
    const png = path.join(snapshotDir, snapshotFileName(entry, mode));
    if (!existsSync(png)) continue;
    const url = baselinePublicUrl(entry, mode);
    patchStoryBaselineImages({
      packageRoot: root,
      storyId: entry.id,
      url,
    });
    patchStoryVisualReviewStatus({
      packageRoot: root,
      storyId: entry.id,
      status: "pending",
    });
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
  const port = options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT;
  const stepId = (options.stepId ?? slugifyStepLabel(stepLabel)).trim();

  ensureStorybookStatic(root, options.skipBuild);

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

  await ensurePlaywrightWebServerPort(port);

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
