import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import {
  VISUAL_DELTA_ACTION_SCOPE_PATH,
  VISUAL_DELTA_AFFECTED_PLAN_PATH,
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_CAPTURE_PATH,
  VISUAL_DELTA_CHANGE_SET_COMMIT_PATH,
  VISUAL_DELTA_CHANGE_SET_FILE_PATH,
  VISUAL_DELTA_CHANGE_SETS_PATH,
  VISUAL_DELTA_COMPARE_STORY_PATH,
  VISUAL_DELTA_CONFIG_PATH,
  VISUAL_DELTA_CREATE_INTERACTION_PATH,
  VISUAL_DELTA_CREATE_PATH,
  VISUAL_DELTA_DELETE_PATH,
  VISUAL_DELTA_INIT_PATH,
  VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH,
  VISUAL_DELTA_REBUILD_STATIC_PATH,
  VISUAL_DELTA_REVIEW_PATH,
  VISUAL_DELTA_RUNTIME_PATH,
  VISUAL_DELTA_RUN_EVENTS_PATH,
  VISUAL_DELTA_RUN_PATH,
  VISUAL_DELTA_RUN_STATUS_PATH,
  VISUAL_DELTA_SKIP_VISUAL_PATH,
  VISUAL_DELTA_STORY_FACTS_PATH,
  VISUAL_DELTA_STORY_CONFIG_PATH,
  VISUAL_DELTA_UPDATE_PATH,
  isVisualReviewStatus,
  type VisualReviewStatus,
} from "../constants.js";
import type {
  AffectedVisualSummary,
  VisualActionScopeRequest,
  VisualActionScopeResponse,
  VisualActionScopeStreamEvent,
  VisualRunSelectionMode,
} from "../shared/affected-types.js";
import { resolveVisualActionStoryIds } from "../shared/action-scope.js";
import { ansiRawTail } from "../shared/ansi-log.js";
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";
import type { VisualDeltaChangeSetMutation } from "../shared/change-sets.js";
import {
  isVisualDeltaBrowser,
  validateVisualDeltaBrowsers,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import {
  isVisualTestFailureMode,
  resolveVisualTestFailureMode,
  type VisualTestFailureMode,
} from "../shared/failure-mode.js";
import { classifyVisualRunResult } from "../shared/visual-result-classification.js";
import { isVisualDiffSidecar } from "../visual-diff-sidecar.js";
import {
  modeResultStatus,
  type VisualModeRunResult,
} from "../shared/mode-results.js";
import {
  captureSubjectWithBrowser,
  type CaptureSubjectRequest,
} from "./capture-subject.js";
import type { CaptureSubjectStreamEvent } from "../shared/capture-subject-types.js";
import type {
  CompareStoryRequest,
  CompareStoryStreamEvent,
} from "../shared/compare-story-types.js";
import { compareStoryInCaptureRunner } from "./compare-story.js";
import {
  DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  DEFAULT_VISUAL_TEST_ARGS,
  DEFAULT_VISUAL_UPDATE_ARGS,
  resolveBaselinePathMode,
  resolveRoot,
  resolveSnapshotDir,
  resolveStorybookPort,
  resolveVisualServerPort,
  type VisualDeltaHostOptions,
} from "./options.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";
import { discoverSnapshotBrowsers } from "./snapshot-environments.js";
import type {
  VisualStoryDescriptor,
  VisualStoryFactsRequest,
  VisualStoryFactsResponse,
} from "../shared/story-facts.js";
import {
  requiredVisualBaselineBrowsers,
  resolveVisualStoryFacts,
} from "./story-facts.js";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  validateVisualCaptureProfile,
  type VisualCaptureProfile,
} from "../shared/capture-profile.js";
import { createVisualDeltaRuntimeEndpoint } from "./runtime-instance.js";
import {
  patchStorySkipVisual,
  patchStoryVisualDeltaConfig,
  patchStoryVisualReviewStatus,
} from "./story-source.js";
import {
  validateVisualDeltaStoryConfigUpdate,
  type VisualDeltaStoryConfigUpdateResponse,
} from "../shared/story-config.js";
import {
  baselinePngExistsForStoryId,
  invalidateVisualResultArtifacts,
  loadStoryIndex,
  loadModeSidecarsForStoryId,
  loadSidecarForStoryId,
} from "./visual-sidecars.js";
import {
  affectsAffectedPlan,
  createInvalidatableCache,
} from "./affected-plan-cache.js";
import {
  inspectVisualDeltaOnboarding,
  runVisualDeltaInit,
} from "./init-scaffold.js";
import {
  parseListReporterProgress,
  successfulStoryIdsFromPlaywrightResults,
} from "./playwright-results.js";
import { playwrightStoryIdGrep } from "./story-id-grep.js";
export { parseListReporterProgress, stripAnsi } from "./playwright-results.js";
import { writePlaywrightPassThresholdPercent } from "./playwright-threshold.js";
import {
  VISUAL_DELTA_PROJECT_CONFIG_REL,
  readVisualDeltaProjectConfig,
  writeVisualDeltaProjectConfig,
} from "./project-config.js";
import { shouldAutoAcceptLiveStoryComparison } from "../shared/workflow-config.js";
import {
  beginVisualRunHub,
  getVisualRunHubStatus,
  isVisualRunActive,
  publishVisualRunEvent,
  cancelVisualRunHub,
  subscribeVisualRunHub,
  type VisualRunResponse,
  type VisualRunResultItem,
  type VisualRunStreamEvent,
} from "./run-hub.js";
import {
  ensurePlaywrightWebServerPort,
  ensureWarmStaticStorybookServer,
  invalidateWarmStaticStorybookServer,
} from "./visual-server.js";
import { createBaselineHistoryEndpoint } from "./baseline-history-endpoint.js";
import { VisualDeltaChangeSetStore } from "./change-set-store.js";
import { detectVisualDeltaVcsKind } from "./change-set-vcs.js";
import { deleteVisualBaseline } from "./delete-baseline.js";
import {
  planAffectedVisualTests,
  planAllVisualTests,
  recordAffectedVisualResults,
} from "./affected-visual-tests.js";
import {
  decideStorybookStaticBuild,
  invalidateStorybookStaticFreshness,
  isStorybookStaticComplete,
  markStorybookStaticFresh,
  runStaticBuildSingleFlight,
  type StaticBuildReason,
} from "./static-build.js";
import { runVisualDeltaCaptureJob } from "./capture-runner.js";

type UpdateBody = {
  /** Exact story ids to write in one Playwright invocation. */
  storyIds?: string[];
  /** Legacy single-story input. */
  storyId?: string;
  component?: string;
  /** Force build-storybook before capture (strips host --skip-build). */
  rebuild?: boolean;
  /** Enabled browser whose current-platform baseline will be written. */
  browser?: VisualDeltaBrowser;
};

type InteractionUpdateBody = {
  storyId?: string;
  /** Human step label from `step("…")`. */
  stepLabel?: string;
  /** Optional pre-slugified id; defaults to slugify(stepLabel). */
  stepId?: string;
  /** Exact deterministic Storybook instrumenter call to replay through. */
  captureCallId?: string;
  /** Overwrite an existing interaction PNG. */
  overwrite?: boolean;
  /** Enabled browser whose current-platform interaction baseline will be written. */
  browser?: VisualDeltaBrowser;
};

type DeleteBaselineBody = {
  storyId?: string;
  baselineUrl?: string;
  interactionId?: string;
};

type SpawnedVisualCommand = ChildProcess & {
  on: {
    (event: "error", listener: (error: Error) => void): SpawnedVisualCommand;
    (
      event: "close",
      listener: (code: number | null) => void,
    ): SpawnedVisualCommand;
  };
};

type RunBody = {
  /** Limit Playwright `-g` to these exact story ids. */
  storyIds?: string[];
  /** Affected, complete, or explicitly selected visual story scope. */
  selection?: VisualRunSelectionMode;
  /** Rebuild storybook-static before running (slow but picks up live edits). */
  rebuild?: boolean;
  browsers?: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  /** Force canonical capture rather than reusable actual comparison. */
  fresh?: boolean;
};

export type {
  VisualRunResponse,
  VisualRunResultItem,
  VisualRunStreamEvent,
} from "./run-hub.js";

let activeRun: ChildProcess | null = null;
let activeCaptureRun: AbortController | null = null;
let staticStaleReason: Extract<
  StaticBuildReason,
  "stale-config" | "unskip"
> | null = null;

function readJsonBody<T>(req: IncomingMessage, maxBytes = 64_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function relativeToRoot(root: string, absolute: string): string | null {
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  return relative &&
    relative !== "." &&
    !relative.startsWith("../") &&
    !path.posix.isAbsolute(relative)
    ? relative
    : null;
}

function storySourcePaths(root: string, storyIds: readonly string[]): string[] {
  const index = loadStoryIndex(root);
  return [
    ...new Set(
      storyIds
        .map((storyId) => index[storyId]?.importPath)
        .filter((entry): entry is string => Boolean(entry))
        .map((entry) => entry.replaceAll("\\", "/").replace(/^\.\//, "")),
    ),
  ];
}

function componentStoryIds(root: string, component: string): string[] {
  const prefix = component.endsWith("--") ? component : `${component}--`;
  return Object.keys(loadStoryIndex(root)).filter((storyId) =>
    storyId.startsWith(prefix),
  );
}

function snapshotPrefix(
  root: string,
  options: VisualDeltaHostOptions,
): string[] {
  const relative = relativeToRoot(root, resolveSnapshotDir(options, root));
  return relative ? [relative] : [];
}

function workflowFor(root: string) {
  return readVisualDeltaProjectConfig(root).workflow;
}

function mutationMarker(change: VisualDeltaChangeSetMutation): string {
  return `[visual-delta-change ${JSON.stringify(change)}]`;
}

function validStoryDescriptors(value: unknown): VisualStoryDescriptor[] | null {
  if (!Array.isArray(value) || value.length > 20_000) return null;
  const stories: VisualStoryDescriptor[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof (candidate as { id?: unknown }).id !== "string"
    ) {
      return null;
    }
    const story = candidate as VisualStoryDescriptor;
    if (seen.has(story.id)) continue;
    seen.add(story.id);
    stories.push(story);
  }
  return stories;
}

async function handleStoryFacts(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
) {
  let body: VisualStoryFactsRequest;
  try {
    body = await readJsonBody<VisualStoryFactsRequest>(req, 2_000_000);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const stories = validStoryDescriptors(body.stories);
  if (!stories) {
    writeJson(res, 400, {
      ok: false,
      error: "Expected an array of Storybook story descriptors",
    });
    return;
  }
  const snapshotDir = resolveSnapshotDir(options, root);
  const projectConfig = readVisualDeltaProjectConfig(root);
  const availableBrowsers = discoverSnapshotBrowsers(snapshotDir);
  const requiredBrowsers = requiredVisualBaselineBrowsers(
    projectConfig.browsers,
  );
  const response: VisualStoryFactsResponse = {
    ok: true,
    version: 4,
    generatedAt: Date.now(),
    availableBrowsers,
    requiredBrowsers,
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
    stories: resolveVisualStoryFacts(
      stories,
      snapshotDir,
      resolveBaselinePathMode(options),
      projectConfig.browsers,
      availableBrowsers,
      root,
    ),
  };
  writeJson(res, 200, response);
}

/**
 * Build a Playwright `-g` filter from selected story ids.
 *
 * List reporters render `›` separators, but Playwright applies grep to its
 * space-joined internal title. The whitespace boundary plus escaped end anchor
 * keeps both single and batched selections exact.
 */
export function grepFromStoryIds(storyIds?: string[]): string | undefined {
  return playwrightStoryIdGrep(storyIds);
}

/** Error when refusing `visual-failed` without a committed baseline PNG. */
export const NO_BASELINE_FAILED_ERROR =
  "Cannot mark failed — no baseline screenshot";

/** Attach on-disk JSON sidecars produced by the visual suite. */
export function attachSidecars(
  results: VisualRunResultItem[],
  packageRoot: string,
  options: VisualDeltaHostOptions = {},
): VisualRunResultItem[] {
  const snapshotDir = resolveSnapshotDir(options, packageRoot);
  const mode = resolveBaselinePathMode(options);
  return results.map((item) => {
    const browser = item.target?.browser ?? item.environment?.browser ?? "chromium";
    const sidecar = loadSidecarForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
      browser,
    );
    const hasBaseline = baselinePngExistsForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
      browser,
    );
    const modeSidecars = loadModeSidecarsForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
      browser,
    );
    const modeResults: VisualModeRunResult[] = [
      ...(sidecar
        ? [
            {
              mode: null,
              status: modeResultStatus(sidecar, hasBaseline),
              sidecar,
              ...(sidecar.error ? { error: sidecar.error } : {}),
            } satisfies VisualModeRunResult,
          ]
        : []),
      ...modeSidecars.map((modeSidecar) => {
        const modeBaseline = path.join(
          snapshotDir,
          modeSidecar.snapshotRel.replace(
            /\.png$/i,
            `-${browser}.png`,
          ),
        );
        return {
          mode: modeSidecar.mode ?? null,
          status: modeResultStatus(modeSidecar, existsSync(modeBaseline)),
          sidecar: modeSidecar,
          ...(modeSidecar.error ? { error: modeSidecar.error } : {}),
        } satisfies VisualModeRunResult;
      }),
    ];
    const comparisonSidecars = [sidecar, ...modeSidecars].filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
    );
    const policyStatus = comparisonSidecars.some(
      (candidate) => candidate.policyStatus === "failed",
    )
      ? "failed"
      : comparisonSidecars.some(
            (candidate) => candidate.policyStatus === "warning",
          )
        ? "warning"
        : sidecar?.policyStatus;
    let next: VisualRunResultItem = sidecar
      ? {
          ...item,
          sidecar,
          modeResults,
          outcome: sidecar.outcome,
          policyStatus,
          target: { browser },
          captureProfile: sidecar.captureProfile ?? item.captureProfile,
          environment: {
            browser,
            platform:
              sidecar.captureProfile?.os ??
              item.captureProfile?.os ??
              item.environment?.platform ??
              sidecar.platform ??
              "unknown",
          },
        }
      : { ...item };
    if (!sidecar && modeResults.length > 0) {
      next = { ...next, modeResults };
    }
    if (item.status === "failed" && !hasBaseline) {
      next = {
        ...next,
        missingBaseline: true,
        error: next.error ?? "No baseline screenshot",
      };
    }
    return next;
  });
}

function canMarkVisualFailed(
  root: string,
  storyId: string,
  options: VisualDeltaHostOptions,
): boolean {
  return baselinePngExistsForStoryId(
    storyId,
    root,
    resolveSnapshotDir(options, root),
    resolveBaselinePathMode(options),
  );
}

function summarize(results: VisualRunResultItem[]) {
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    warnings: 0,
  };
  for (const item of results) {
    if (item.policyStatus === "warning") summary.warnings++;
    else if (item.status === "passed") summary.passed++;
    else if (item.status === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

export function visualTestCommandArgs(
  options: VisualDeltaHostOptions = {},
  grep?: string,
  browsers: readonly VisualDeltaBrowser[] = [],
): string[] {
  // List-only: pairing `--reporter=json` on stdout suppresses list lines (or
  // downgrades to line reporter), so the Testing Module stays at 0/N until done.
  return [
    ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
    "--reporter=list",
    ...browsers.flatMap((browser) => ["--project", browser]),
    ...(grep ? ["-g", grep] : []),
  ];
}

/**
 * Count visual stories in storybook-static.
 * When `storyIds` is provided, count exact membership (not a regex filter) so
 * story/component progress totals match the scoped run.
 */
export function countVisualStories(root: string, storyIds?: string[]): number {
  const indexPath = path.join(root, "storybook-static", "index.json");
  if (!existsSync(indexPath)) {
    // Fall back to the requested scope size when the static index is absent.
    return storyIds?.length ?? 0;
  }
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
    const stories = Object.values(index.entries ?? {}).filter(
      (e) => e.type === "story" && !(e.tags ?? []).includes("skip-visual"),
    );
    if (storyIds?.length) {
      const wanted = new Set(storyIds);
      return stories.filter((e) => wanted.has(e.id)).length;
    }
    return stories.length;
  } catch {
    return storyIds?.length ?? 0;
  }
}

function disabledAffectedPlan(root: string, options: VisualDeltaHostOptions) {
  const plan = planAllVisualTests(root, options);
  return {
    ...plan,
    summary: {
      ...plan.summary,
      selection: "affected" as const,
      fallbackReason: "Affected visual tests are not enabled for this host",
      noChange: false,
    },
    needsRebuild: true,
  };
}

function affectedPlan(root: string, options: VisualDeltaHostOptions) {
  return options.affectedTests
    ? planAffectedVisualTests(root, options)
    : disabledAffectedPlan(root, options);
}

function selectedRunSummary(
  root: string,
  options: VisualDeltaHostOptions,
  storyIds: string[] | undefined,
  selection: VisualRunSelectionMode,
): AffectedVisualSummary {
  const all = planAllVisualTests(root, options).runnableStoryIds;
  const selected =
    selection === "all" || !storyIds
      ? all
      : all.filter((storyId) => new Set(storyIds).has(storyId));
  return {
    selection,
    selected: selected.length,
    unchanged: Math.max(0, all.length - selected.length),
    total: all.length,
    noChange: selected.length === 0,
    storyIds: selected,
  };
}

function writeNdjson(res: ServerResponse, event: VisualRunStreamEvent) {
  res.write(`${JSON.stringify(event)}\n`);
}

/** Emit to the reconnectable run hub (and all live NDJSON subscribers). */
function emitRun(event: VisualRunStreamEvent) {
  publishVisualRunEvent(event);
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  onChunk?: (text: string) => void,
): Promise<{ code: number; log: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    }) as SpawnedVisualCommand;
    activeRun = child;
    let log = "";
    const append = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      log += text;
      if (log.length > 200_000) {
        log = ansiRawTail(log, 160_000);
      }
      onChunk?.(text);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error: Error) => {
      if (activeRun === child) activeRun = null;
      reject(error);
    });
    child.on("close", (code: number | null) => {
      if (activeRun === child) activeRun = null;
      resolve({ code: code ?? 1, log });
    });
  });
}

/**
 * Run `pnpm build-storybook` only (no Playwright capture). Streams plain-text
 * logs like baseline create/update so the panel status bar can show progress.
 */
async function handleRebuildStatic(
  res: ServerResponse,
  root: string,
  visualPort: number,
) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Accel-Buffering", "no");
  res.write("Rebuilding storybook-static…\n");

  try {
    const { code } = await runStaticBuildSingleFlight(root, () =>
      runCommand("pnpm", ["build-storybook"], root, undefined, (chunk) => {
        res.write(chunk);
      }),
    );
    if (code === 0) {
      staticStaleReason = null;
      markStorybookStaticFresh(root);
      invalidateWarmStaticStorybookServer();
      const warm = await ensureWarmStaticStorybookServer(root, visualPort);
      if (warm.message) {
        res.write(`${warm.message}\n`);
      }
    }
    res.write(`\n[exit ${code}]\n`);
  } catch (error) {
    res.write(
      `\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  res.end();
}

async function handleBaselineWrite(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  mode: "update" | "create",
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: UpdateBody;
  try {
    body = await readJsonBody<UpdateBody>(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : "Invalid JSON");
    return;
  }

  const storyIds = [
    ...new Set(
      [
        ...(Array.isArray(body.storyIds) ? body.storyIds : []),
        body.storyId ?? "",
      ]
        .filter((storyId): storyId is string => typeof storyId === "string")
        .map((storyId) => storyId.trim())
        .filter(Boolean),
    ),
  ];
  const component = body.component?.trim();
  if (!storyIds.length && !component) {
    res.statusCode = 400;
    res.end("Provide storyIds, storyId, or component");
    return;
  }
  if (storyIds.length && component) {
    res.statusCode = 400;
    res.end("Choose exact storyIds or an explicit component, not both");
    return;
  }

  const browser = body.browser ?? "chromium";
  const projectConfig = readVisualDeltaProjectConfig(root);
  const configError = projectConfig.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configError) {
    res.statusCode = 400;
    res.end(configError.message);
    return;
  }
  const enabledBrowsers = projectConfig.browsers;
  if (!isVisualDeltaBrowser(browser) || !enabledBrowsers.includes(browser)) {
    res.statusCode = 400;
    res.end(
      `Browser ${JSON.stringify(browser)} is not enabled. Enabled browsers: ${enabledBrowsers.join(", ")}`,
    );
    return;
  }

  const createOnly = mode === "create";
  const selectedStoryIds = component
    ? componentStoryIds(root, component)
    : storyIds;
  const mutation = await changeSets.begin({
    action: createOnly ? "baseline-create" : "baseline-update",
    scope:
      component ??
      (storyIds.length === 1 ? storyIds[0]! : `${storyIds.length} stories`),
    storyIds: selectedStoryIds,
    expectedPaths: storySourcePaths(root, selectedStoryIds),
    expectedPrefixes: snapshotPrefix(root, options),
    workflow: workflowFor(root),
  });
  const rebuild = Boolean(body.rebuild);
  const baseArgs = options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS];
  const args = [
    ...(rebuild ? baseArgs.filter((arg) => arg !== "--skip-build") : baseArgs),
    ...(rebuild ? ["--rebuild"] : []),
    ...(createOnly ? ["--create-only"] : []),
    "--browser",
    browser,
    ...(component
      ? ["--component", component]
      : storyIds.flatMap((storyId) => ["--story-id", storyId])),
  ];

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint proxies / browsers not to buffer the streamed body.
  res.setHeader("X-Accel-Buffering", "no");
  const verb = createOnly ? "Creating missing baselines" : "Updating baselines";
  res.write(
    `${verb}${
      component
        ? ` for ${component}`
        : ` for ${storyIds.length} ${storyIds.length === 1 ? "story" : "stories"}`
    }…\n`,
  );
  if (rebuild) {
    res.write("Rebuilding storybook-static before capture…\n");
  }

  try {
    const { code } = await runCommand(
      "pnpm",
      args,
      root,
      { VISUAL_UPDATE_APPROVED: "1" },
      (chunk) => {
        res.write(chunk);
      },
    );
    const changes = await mutation.finish({
      success: code === 0,
      ...(code === 0 ? {} : { error: `Baseline writer exited ${code}` }),
    });
    res.write(`\n[exit ${code}]\n${mutationMarker(changes)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const changes = await mutation.finish({
      success: false,
      error: message,
    });
    res.write(`\n[spawn error] ${message}\n${mutationMarker(changes)}\n`);
  }
  res.end();
}

async function handleInteractionBaselineWrite(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: InteractionUpdateBody;
  try {
    body = await readJsonBody<InteractionUpdateBody>(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : "Invalid JSON");
    return;
  }

  const storyId = body.storyId?.trim();
  const stepLabel = body.stepLabel?.trim();
  const stepId = body.stepId?.trim();
  const captureCallId = body.captureCallId?.trim();
  if (!storyId || !stepLabel) {
    res.statusCode = 400;
    res.end("Provide storyId and stepLabel");
    return;
  }

  const browser = body.browser ?? "chromium";
  const projectConfig = readVisualDeltaProjectConfig(root);
  const configError = projectConfig.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configError) {
    res.statusCode = 400;
    res.end(configError.message);
    return;
  }
  const enabledBrowsers = projectConfig.browsers;
  if (!isVisualDeltaBrowser(browser) || !enabledBrowsers.includes(browser)) {
    res.statusCode = 400;
    res.end(
      `Browser ${JSON.stringify(browser)} is not enabled. Enabled browsers: ${enabledBrowsers.join(", ")}`,
    );
    return;
  }

  const baseArgs = options.visualInteractionUpdateArgs ?? [
    ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  ];
  const mutation = await changeSets.begin({
    action: body.overwrite ? "interaction-update" : "interaction-create",
    scope: storyId,
    storyIds: [storyId],
    expectedPaths: storySourcePaths(root, [storyId]),
    expectedPrefixes: snapshotPrefix(root, options),
    workflow: workflowFor(root),
  });
  const args = [
    ...baseArgs,
    ...(body.overwrite ? [] : ["--create-only"]),
    "--browser",
    browser,
    "--story-id",
    storyId,
    "--step-label",
    stepLabel,
    ...(stepId ? ["--step-id", stepId] : []),
    ...(captureCallId ? ["--capture-call-id", captureCallId] : []),
  ];

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Accel-Buffering", "no");
  res.write(
    `${body.overwrite ? "Updating" : "Creating"} interaction baseline "${stepLabel}" for ${storyId}…\n`,
  );

  try {
    const { code } = await runCommand(
      "pnpm",
      args,
      root,
      { VISUAL_UPDATE_APPROVED: "1" },
      (chunk) => {
        res.write(chunk);
      },
    );
    const changes = await mutation.finish({
      success: code === 0,
      ...(code === 0 ? {} : { error: `Interaction writer exited ${code}` }),
    });
    res.write(`\n[exit ${code}]\n${mutationMarker(changes)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const changes = await mutation.finish({
      success: false,
      error: message,
    });
    res.write(`\n[spawn error] ${message}\n${mutationMarker(changes)}\n`);
  }
  res.end();
}

function beginNdjson(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint proxies / browsers not to buffer the streamed body.
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

async function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
) {
  // Reconnect after manager HMR while Playwright is still running.
  // A finished snapshot must not block starting a new run — use GET
  // `/__visual-delta/run-events` to hydrate recent results instead.
  if (activeRun || activeCaptureRun || isVisualRunActive()) {
    subscribeVisualRunHub(res);
    return;
  }

  let body: RunBody;
  try {
    body = await readJsonBody<RunBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: error instanceof Error ? error.message : "Invalid JSON",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  const selection: VisualRunSelectionMode =
    body.selection ?? (Array.isArray(body.storyIds) ? "selected" : "all");
  const projectConfig = readVisualDeltaProjectConfig(root);
  const configErrors = projectConfig.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configErrors.length > 0) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: configErrors.map((diagnostic) => diagnostic.message).join(" "),
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, warnings: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }
  const requestedBrowsers = validateVisualDeltaBrowsers(
    body.browsers ?? projectConfig.browsers,
  );
  const disabledBrowsers = requestedBrowsers.value.filter(
    (browser) => !projectConfig.browsers.includes(browser),
  );
  if (
    requestedBrowsers.errors.length > 0 ||
    disabledBrowsers.length > 0 ||
    (body.failureMode != null && !isVisualTestFailureMode(body.failureMode))
  ) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error:
        requestedBrowsers.errors.join(" ") ||
        (disabledBrowsers.length
          ? `Browsers are not enabled in project configuration: ${disabledBrowsers.join(", ")}`
          : 'failureMode must be "warn" or "strict"'),
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, warnings: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }
  const selectedBrowsers = requestedBrowsers.value;
  const failureMode = resolveVisualTestFailureMode({
    explicit: body.failureMode,
    environment: process.env.VISUAL_DELTA_FAILURE_MODE,
    configured: projectConfig.workflow.visualTestFailureMode,
  });

  if (
    selection === "affected" &&
    Array.isArray(body.storyIds) &&
    body.storyIds.length > 0
  ) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: "Affected selection cannot be combined with explicit story ids",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  // Scoped runs must never broaden to the full suite when the selection is empty.
  if (
    selection === "selected" &&
    Array.isArray(body.storyIds) &&
    body.storyIds.length === 0
  ) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error:
        "No runnable visual stories in the selected scope (all skip-visual or empty)",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  let plan =
    selection === "affected"
      ? affectedPlan(root, options)
      : planAllVisualTests(root, options);
  let selectedStoryIds =
    selection === "selected"
      ? body.storyIds
      : selection === "affected"
        ? plan.selectedStoryIds
        : plan.runnableStoryIds;
  let affected =
    selection === "affected"
      ? plan.summary
      : selectedRunSummary(root, options, selectedStoryIds, selection);

  if (selection === "affected" && affected.noChange) {
    beginVisualRunHub();
    subscribeVisualRunHub(res);
    emitRun({ type: "start", total: 0, affected });
    emitRun({
      type: "done",
      ok: true,
      exitCode: 0,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "Affected visual tests are up to date",
      affected,
    });
    return;
  }

  if (options.allowRebuild === false) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: "Canonical capture-runner comparisons require a static Storybook build",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
      affected,
    } satisfies VisualRunResponse);
    return;
  }

  const storyIds = [...new Set(selectedStoryIds ?? [])];
  const grep = selection === "all" ? undefined : grepFromStoryIds(storyIds);
  const total = storyIds.length * selectedBrowsers.length;
  let log = "";
  let activeProfile: VisualCaptureProfile | undefined;
  const controller = new AbortController();
  activeCaptureRun = controller;

  beginVisualRunHub();
  subscribeVisualRunHub(res);
  emitRun({ type: "start", total, affected });

  try {
    const seen = new Set<string>();
    let completed = 0;
    let passed = 0;
    let failed = 0;
    let lineBuffer = "";
    const affectedConfig = options.affectedTests || undefined;
    const argv = [
      "test",
      ...(selection === "all"
        ? ["--all"]
        : storyIds.flatMap((storyId) => ["--story-id", storyId])),
      ...selectedBrowsers.flatMap((browser) => ["--browser", browser]),
      "--failure-mode",
      failureMode,
      ...(options.snapshotDir?.trim()
        ? ["--snapshot-dir", resolveSnapshotDir(options, root)]
        : []),
      ...(options.baselinePathMode
        ? ["--baseline-path-mode", options.baselinePathMode]
        : []),
      ...(options.visualTestArgs ?? []).flatMap((argument) => [
        "--visual-test-arg",
        argument,
      ]),
      ...(affectedConfig?.cacheDir
        ? ["--cache-dir", affectedConfig.cacheDir]
        : []),
      ...(affectedConfig?.externals ?? []).flatMap((glob) => [
        "--external",
        glob,
      ]),
      ...(affectedConfig?.untraced ?? []).flatMap((glob) => [
        "--untraced",
        glob,
      ]),
      ...(body.fresh ? ["--fresh"] : []),
    ];
    const runnerResult = await runVisualDeltaCaptureJob({
      root,
      argv,
      operation: "test",
      storyIds: selection === "all" ? [] : storyIds,
      browsers: selectedBrowsers,
      failureMode,
      context: {
        signal: controller.signal,
        onEvent(event) {
          if (event.type === "start") {
            activeProfile = event.profile;
            emitRun({ type: "start", total, affected, captureProfile: event.profile });
            return;
          }
          if (event.type !== "log") return;
          log = ansiRawTail(`${log}${event.message}`, 200_000);
          emitRun({ type: "log", line: event.message.trimEnd() });
          lineBuffer += event.message;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";
          for (const line of lines) {
            for (const item of parseListReporterProgress(`${line}\n`)) {
              const key = `${item.browser}:${item.index}`;
              if (seen.has(key)) continue;
              seen.add(key);
              completed += 1;
              if (item.status === "passed") passed += 1;
              else failed += 1;
              emitRun({
                type: "progress",
                completed,
                total: total || completed,
                passed,
                failed,
                storyId: item.storyId,
                status: item.status,
                target: item.target,
                ...(activeProfile
                  ? {
                      captureProfile: activeProfile,
                      environment: {
                        browser: item.browser,
                        platform: activeProfile.os,
                      },
                    }
                  : {}),
              });
            }
          }
        },
      },
    });
    if (controller.signal.aborted) return;
    activeProfile = runnerResult.profile;
    const snapshotDir = resolveSnapshotDir(options, root);
    const baselineMode = resolveBaselinePathMode(options);
    const returnedTargets = new Map<
      string,
      { storyId: string; browser: VisualDeltaBrowser }
    >();
    for (const artifact of runnerResult.stagedArtifacts ?? []) {
      const relative = artifact.relativePath.replaceAll("\\", "/");
      if (!relative.toLowerCase().endsWith(".json")) continue;
      const parsed = JSON.parse(
        readFileSync(path.resolve(root, ...relative.split("/")), "utf8"),
      ) as unknown;
      if (!isVisualDiffSidecar(parsed)) continue;
      const browser = parsed.target?.browser ?? parsed.browser;
      if (!browser) continue;
      returnedTargets.set(`${parsed.storyId}:${browser}`, {
        storyId: parsed.storyId,
        browser,
      });
    }
    const targetPairs = selection === "all"
      ? [...returnedTargets.values()]
      : storyIds.flatMap((storyId) =>
          selectedBrowsers.map((browser) => ({ storyId, browser })),
        );
    const results = attachSidecars(
      targetPairs.map(({ storyId, browser }) => {
        const sidecar = loadSidecarForStoryId(
          storyId,
          root,
          snapshotDir,
          baselineMode,
          browser,
        );
        return {
          storyId,
          title: storyId,
          status: sidecar?.status ?? "failed",
          ...(sidecar ? {} : { error: "Capture runner produced no sidecar" }),
          target: { browser },
          captureProfile: runnerResult.profile,
          environment: { browser, platform: runnerResult.profile.os },
        } satisfies VisualRunResultItem;
      }),
      root,
      options,
    );
    const summary = summarize(results);
    const passedStoryIds = successfulStoryIdsFromPlaywrightResults({
      root,
      hostOptions: options,
      results,
    });
    recordAffectedVisualResults({ root, hostOptions: options, passedStoryIds });
    emitRun({
      type: "done",
      ok: runnerResult.exitCode === 0 && summary.failed === 0,
      exitCode: runnerResult.exitCode,
      rebuild: true,
      grep,
      summary,
      results,
      logTail: ansiRawTail(log, 6000),
      affected,
      browsers: selectedBrowsers,
      captureProfile: runnerResult.profile,
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    emitRun({ type: "error", error: message, crashed: true });
    emitRun({
      type: "done",
      ok: false,
      crashed: true,
      error: message,
      exitCode: 1,
      rebuild: true,
      grep,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: ansiRawTail(log, 4000),
      affected,
      browsers: selectedBrowsers,
      captureProfile: activeProfile,
    });
  } finally {
    if (activeCaptureRun === controller) activeCaptureRun = null;
  }
}

function handleCancel(res: ServerResponse) {
  const hadChild = Boolean(activeRun || activeCaptureRun);
  if (activeRun) {
    activeRun.kill("SIGTERM");
    activeRun = null;
  }
  if (activeCaptureRun) {
    activeCaptureRun.abort();
    activeCaptureRun = null;
  }
  cancelVisualRunHub({ hadChild });
  writeJson(res, 200, { ok: true, cancelled: hadChild });
}

function handleAffectedPlan(
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  plan = affectedPlan(root, options),
): void {
  writeJson(res, 200, {
    enabled: Boolean(options.affectedTests),
    ...plan.summary,
  });
}

async function handleActionScope(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
): Promise<void> {
  if (activeRun || activeCaptureRun || isVisualRunActive()) {
    writeJson(res, 409, {
      ok: false,
      error:
        "Wait for the active visual operation before resolving a new scope",
    });
    return;
  }

  let body: VisualActionScopeRequest;
  try {
    body = await readJsonBody<VisualActionScopeRequest>(req, 2_000_000);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }
  if (
    !Array.isArray(body.visibleStoryIds) ||
    body.visibleStoryIds.length > 20_000 ||
    body.visibleStoryIds.some((storyId) => typeof storyId !== "string") ||
    typeof body.affectedOnly !== "boolean"
  ) {
    writeJson(res, 400, {
      ok: false,
      error: "Provide visibleStoryIds (string[]) and affectedOnly (boolean)",
    });
    return;
  }

  const visibleStoryIds = [
    ...new Set(body.visibleStoryIds.map((storyId) => storyId.trim())),
  ].filter(Boolean);

  beginNdjson(res);
  const write = (event: VisualActionScopeStreamEvent) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
    const flushable = res as ServerResponse & { flush?: () => void };
    flushable.flush?.();
  };
  write({
    type: "progress",
    phase: "resolving",
    message: body.affectedOnly
      ? "Resolving affected scope…"
      : "Resolving visible scope…",
  });
  // Let Node flush the first chunk before dependency-graph planning performs
  // synchronous filesystem/hash work.
  await new Promise<void>((resolve) => setImmediate(resolve));

  let plan = body.affectedOnly
    ? affectedPlan(root, options)
    : planAllVisualTests(root, options);
  let rebuilt = false;
  const preflightReason = plan.needsRebuild
    ? ("affected-plan" as const)
    : (staticStaleReason ?? undefined);
  const buildDecision = decideStorybookStaticBuild({
    packageRoot: root,
    skipBuild: options.allowRebuild === false,
    forceRebuild: Boolean(preflightReason),
    forceReason: preflightReason,
    storyIdPrefix: "",
    storyIds: visibleStoryIds,
  });
  if (
    body.affectedOnly &&
    options.allowRebuild === false &&
    (buildDecision.shouldBuild || buildDecision.reason === "skip-build-missing")
  ) {
    write({
      type: "error",
      error: buildDecision.message,
    });
    res.end();
    return;
  }

  if (body.affectedOnly && buildDecision.shouldBuild) {
    const rebuildStartedAt = Date.now();
    write({
      type: "progress",
      phase: "rebuilding",
      message: `${buildDecision.message}… 0s`,
      elapsedMs: 0,
    });
    const heartbeat = setInterval(() => {
      const elapsedMs = Date.now() - rebuildStartedAt;
      write({
        type: "progress",
        phase: "rebuilding",
        message: `${buildDecision.message}… ${Math.floor(elapsedMs / 1_000)}s`,
        elapsedMs,
      });
    }, 1_000);
    let built: Awaited<ReturnType<typeof runCommand>>;
    try {
      built = await runStaticBuildSingleFlight(root, () =>
        runCommand("pnpm", ["build-storybook"], root),
      );
    } catch (error) {
      write({
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to start build-storybook",
      });
      res.end();
      return;
    } finally {
      clearInterval(heartbeat);
    }
    if (built.code !== 0) {
      write({
        type: "error",
        error: "build-storybook failed while refreshing the affected scope",
        logTail: ansiRawTail(built.log, 4000),
      });
      res.end();
      return;
    }
    rebuilt = true;
    staticStaleReason = null;
    markStorybookStaticFresh(root);
    invalidateWarmStaticStorybookServer();
    write({
      type: "progress",
      phase: "resolving",
      message: "Refreshing affected plan…",
    });
    plan = affectedPlan(root, options);
  }

  const eligibleVisible = resolveVisualActionStoryIds({
    context: "global",
    visibleStoryIds,
    ...(body.affectedOnly ? { runnableStoryIds: plan.runnableStoryIds } : {}),
  });
  const storyIds = resolveVisualActionStoryIds({
    context: "global",
    visibleStoryIds,
    ...(body.affectedOnly
      ? {
          runnableStoryIds: plan.runnableStoryIds,
          affectedStoryIds: plan.selectedStoryIds,
        }
      : {}),
    affectedOnly: body.affectedOnly,
  });
  const summary: AffectedVisualSummary = {
    selection: body.affectedOnly ? "affected" : "selected",
    selected: storyIds.length,
    unchanged: Math.max(0, eligibleVisible.length - storyIds.length),
    total: eligibleVisible.length,
    noChange: storyIds.length === 0,
    ...(plan.summary.fallbackReason
      ? { fallbackReason: plan.summary.fallbackReason }
      : {}),
    ...(plan.summary.changedInputs?.length
      ? { changedInputs: plan.summary.changedInputs }
      : {}),
    storyIds,
  };
  const scopeLabel = body.affectedOnly ? "affected" : "visible";
  write({
    type: "progress",
    phase: "freezing",
    message: `Freezing ${storyIds.length} ${scopeLabel} ${storyIds.length === 1 ? "story" : "stories"}…`,
  });
  write({
    type: "done",
    ok: true,
    storyIds,
    summary,
    rebuilt,
  } satisfies VisualActionScopeStreamEvent);
  res.end();
}

function handleRunEvents(res: ServerResponse) {
  subscribeVisualRunHub(res);
}

function handleRunStatus(res: ServerResponse) {
  writeJson(res, 200, {
    ...getVisualRunHubStatus(),
    /** True while any middleware-spawned child (compare or baseline write) is alive. */
    childActive: Boolean(activeRun || activeCaptureRun),
  });
}

type ReviewBody = {
  storyId?: string;
  status?: VisualReviewStatus;
  /** Batch updates — preferred after a suite run to cut HMR churn. */
  updates?: Array<{ storyId?: string; status?: VisualReviewStatus }>;
};

async function handleReviewStatus(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions = {},
  changeSets?: VisualDeltaChangeSetStore,
) {
  let body: ReviewBody;
  try {
    body = await readJsonBody<ReviewBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }

  if (Array.isArray(body.updates)) {
    if (!body.updates.length) {
      writeJson(res, 400, { ok: false, error: "updates must not be empty" });
      return;
    }
    const requestedIds = body.updates
      .map((item) => item.storyId?.trim())
      .filter((item): item is string => Boolean(item));
    const mutation = changeSets
      ? await changeSets.begin({
          action: "status-batch",
          scope: `${requestedIds.length} ${requestedIds.length === 1 ? "story" : "stories"}`,
          storyIds: requestedIds,
          expectedPaths: storySourcePaths(root, requestedIds),
          workflow: workflowFor(root),
        })
      : null;
    let updated = 0;
    const errors: string[] = [];
    for (const item of body.updates) {
      const storyId = item.storyId?.trim();
      const status = item.status;
      if (!storyId || !isVisualReviewStatus(status)) {
        errors.push(`${storyId ?? "(missing)"}: invalid storyId/status`);
        continue;
      }
      if (status === "failed" && !canMarkVisualFailed(root, storyId, options)) {
        errors.push(`${storyId}: ${NO_BASELINE_FAILED_ERROR}`);
        continue;
      }
      const result = patchStoryVisualReviewStatus({
        packageRoot: root,
        storyId,
        status,
      });
      if (result.ok) updated += 1;
      else errors.push(`${storyId}: ${result.error ?? "update failed"}`);
    }
    const changes = await mutation?.finish({
      success: errors.length === 0,
      ...(errors.length ? { error: errors.join(" ") } : {}),
    });
    writeJson(res, 200, {
      ok: errors.length === 0,
      updated,
      errors,
      ...(changes ? { changes } : {}),
    });
    return;
  }

  const storyId = body.storyId?.trim();
  const status = body.status;
  if (!storyId || !isVisualReviewStatus(status)) {
    writeJson(res, 400, {
      ok: false,
      error:
        'Provide storyId and status ("pending" | "approved" | "ready" | "failed"), or updates[]',
    });
    return;
  }

  if (status === "failed" && !canMarkVisualFailed(root, storyId, options)) {
    writeJson(res, 400, {
      ok: false,
      storyId,
      status,
      error: NO_BASELINE_FAILED_ERROR,
    });
    return;
  }

  const mutation = changeSets
    ? await changeSets.begin({
        action: "review-status",
        scope: storyId,
        storyIds: [storyId],
        expectedPaths: storySourcePaths(root, [storyId]),
        workflow: workflowFor(root),
      })
    : null;
  const result = patchStoryVisualReviewStatus({
    packageRoot: root,
    storyId,
    status,
  });
  const changes = await mutation?.finish({
    success: result.ok,
    ...(result.error ? { error: result.error } : {}),
  });
  writeJson(res, result.ok ? 200 : 400, {
    ...result,
    ...(changes ? { changes } : {}),
  });
}

type SkipVisualBody = {
  storyId?: string;
  /** `true` = add skip-visual; `false` = remove it. */
  skip?: boolean;
};

async function handleSkipVisual(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: SkipVisualBody;
  try {
    body = await readJsonBody<SkipVisualBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }

  const storyId = body.storyId?.trim();
  if (!storyId || typeof body.skip !== "boolean") {
    writeJson(res, 400, {
      ok: false,
      error: "Provide storyId and skip (boolean)",
    });
    return;
  }

  const mutation = await changeSets.begin({
    action: "skip-visual",
    scope: storyId,
    storyIds: [storyId],
    expectedPaths: storySourcePaths(root, [storyId]),
    workflow: workflowFor(root),
  });
  const result = patchStorySkipVisual({
    packageRoot: root,
    storyId,
    skip: body.skip,
  });
  if (result.ok) {
    invalidateVisualResultArtifacts({
      packageRoot: root,
      snapshotDir: resolveSnapshotDir(options, root),
      mode: resolveBaselinePathMode(options),
      storyIds: [storyId],
    });
    staticStaleReason = "unskip";
    invalidateStorybookStaticFreshness(root);
  }
  const changes = await mutation.finish({
    success: result.ok,
    ...(result.error ? { error: result.error } : {}),
  });
  writeJson(res, result.ok ? 200 : 400, { ...result, changes });
}

async function handleDeleteBaseline(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: DeleteBaselineBody;
  try {
    body = await readJsonBody<DeleteBaselineBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }

  const storyId = body.storyId?.trim() ?? "";
  const mutation = await changeSets.begin({
    action: "baseline-delete",
    scope: storyId || "baseline",
    storyIds: storyId ? [storyId] : [],
    expectedPaths: storyId ? storySourcePaths(root, [storyId]) : [],
    expectedPrefixes: snapshotPrefix(root, options),
    workflow: workflowFor(root),
  });
  try {
    const result = deleteVisualBaseline(root, options, {
      storyId: body.storyId ?? "",
      baselineUrl: body.baselineUrl ?? "",
      interactionId: body.interactionId,
    });
    writeJson(res, 200, {
      ...result,
      changes: await mutation.finish({ success: true }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Delete screenshot failed";
    writeJson(res, 400, {
      ok: false,
      error: message,
      changes: await mutation.finish({ success: false, error: message }),
    });
  }
}

function resolvedConfigPayload(
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
): VisualDeltaResolvedConfig {
  const snapshotDir = resolveSnapshotDir(options, root);
  const onboardingStatus = inspectVisualDeltaOnboarding(root, snapshotDir);
  const diagnostics: VisualDeltaConfigDiagnostic[] = [];
  const projectConfig = readVisualDeltaProjectConfig(root);
  const vcsKind = detectVisualDeltaVcsKind(root);
  diagnostics.push(...projectConfig.diagnostics);
  if (!existsSync(snapshotDir)) {
    diagnostics.push({
      code: "snapshot-dir-missing",
      severity: "warning",
      setting: "snapshotDir",
      message: `Snapshot directory does not exist yet: ${snapshotDir}`,
      suggestion: "Create the first visual baseline to initialize it.",
    });
  }
  if (!onboardingStatus.ready) {
    diagnostics.push({
      code: "playwright-setup-incomplete",
      severity: "error",
      setting: "onboarding",
      message: onboardingStatus.hint,
      suggestion: "Run pnpm exec visual-delta init from the package root.",
    });
  }
  const staticHint =
    "Preset staticDirs mounts snapshotDir at /visual-baselines (or host maps it).";
  diagnostics.push({
    code: "static-baseline-mount",
    severity: "info",
    setting: "snapshotDir",
    message: staticHint,
  });
  const payload: VisualDeltaResolvedConfig = {
    ok: true,
    options: {
      root,
      snapshotDir,
      baselinePathMode: resolveBaselinePathMode(options),
      visualServerPort: visualPort,
      allowRebuild: options.allowRebuild !== false,
      allowVcsWrites: options.allowVcsWrites === true,
      visualUpdateArgs: [
        ...(options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS]),
      ],
      visualInteractionUpdateArgs: [
        ...(options.visualInteractionUpdateArgs ?? [
          ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
        ]),
      ],
      visualTestArgs: [
        ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
      ],
      addonSrcDir: options.addonSrcDir?.trim() || null,
    },
    playwrightPassThresholdPercent: projectConfig.defaults.passThresholdPercent,
    projectDefaults: projectConfig.defaults,
    browsers: projectConfig.browsers,
    captureWorkspaceIgnore: projectConfig.captureWorkspaceIgnore,
    runtimePlatform: process.platform,
    availableEnvironments: [],
    availableBrowsers: discoverSnapshotBrowsers(snapshotDir),
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
    captureRunner: {
      kind: existsSync(path.join(root, ".visual-delta/runner.mjs"))
        ? "custom"
        : "docker",
      available:
        existsSync(path.join(root, ".visual-delta/runner.mjs")) ||
        validateVisualCaptureProfile(CANONICAL_VISUAL_CAPTURE_PROFILE).length ===
          0,
      ...(!existsSync(path.join(root, ".visual-delta/runner.mjs")) &&
      validateVisualCaptureProfile(CANONICAL_VISUAL_CAPTURE_PROFILE).length
        ? {
            reason: validateVisualCaptureProfile(
              CANONICAL_VISUAL_CAPTURE_PROFILE,
            ).join(" "),
          }
        : {}),
    },
    workflow: projectConfig.workflow,
    vcs: {
      kind: vcsKind,
      available: vcsKind != null,
      writeAllowed: vcsKind != null && options.allowVcsWrites === true,
      ...(!vcsKind
        ? { reason: "No Git or Jujutsu repository was detected." }
        : options.allowVcsWrites !== true
          ? {
              reason:
                "VCS commits are disabled until allowVcsWrites is enabled in Storybook.",
            }
          : {}),
    },
    projectDefaultSources: projectConfig.sources,
    projectConfigPath: projectConfig.path,
    projectConfigExists: projectConfig.exists,
    onboarding: {
      suiteReady: onboardingStatus.suiteReady,
      playwrightConfigReady: onboardingStatus.playwrightConfigReady,
      snapshotDirExists: onboardingStatus.snapshotDirExists,
      ready: onboardingStatus.ready,
      hint: onboardingStatus.hint,
    },
    diagnostics,
    warnings: diagnostics.map((diagnostic) => diagnostic.message),
  };
  return payload;
}

function handleConfigGet(
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
) {
  writeJson(res, 200, resolvedConfigPayload(root, options, visualPort));
}

async function handleConfigPut(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
  changeSets: VisualDeltaChangeSetStore,
): Promise<boolean> {
  let body: unknown;
  let mutation: Awaited<ReturnType<VisualDeltaChangeSetStore["begin"]>> | null =
    null;
  try {
    body = await readJsonBody(req);
    mutation = await changeSets.begin({
      action: "project-config",
      scope: "project configuration",
      expectedPaths: [VISUAL_DELTA_PROJECT_CONFIG_REL],
      workflow: workflowFor(root),
      forceReview: true,
    });
    writeVisualDeltaProjectConfig(root, body);
    invalidateVisualResultArtifacts({
      packageRoot: root,
      snapshotDir: resolveSnapshotDir(options, root),
      mode: resolveBaselinePathMode(options),
    });
    staticStaleReason = "stale-config";
    invalidateStorybookStaticFreshness(root);
    invalidateWarmStaticStorybookServer();
    const changes = await mutation.finish({ success: true });
    writeJson(res, 200, {
      ...resolvedConfigPayload(root, options, visualPort),
      changes,
    });
    return true;
  } catch (error) {
    const changes = await mutation
      ?.finish({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      .catch(() => undefined);
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...(changes ? { changes } : {}),
    });
    return false;
  }
}

async function handleStoryConfigPut(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }
  const validation = validateVisualDeltaStoryConfigUpdate(body);
  if (!validation.value) {
    writeJson(res, 400, {
      ok: false,
      error: validation.errors.join(" "),
      errors: validation.errors,
    });
    return;
  }
  const { storyId, values = {}, unset = [] } = validation.value;
  const mutation = await changeSets.begin({
    action: "story-config",
    scope: storyId,
    storyIds: [storyId],
    expectedPaths: storySourcePaths(root, [storyId]),
    workflow: workflowFor(root),
  });
  const result = patchStoryVisualDeltaConfig({
    packageRoot: root,
    storyId,
    values,
    unset,
  });
  if (!result.ok) {
    const changes = await mutation.finish({
      success: false,
      error: result.error,
    });
    writeJson(res, 400, { ...result, changes });
    return;
  }
  staticStaleReason = "stale-config";
  invalidateStorybookStaticFreshness(root);
  invalidateVisualResultArtifacts({
    packageRoot: root,
    snapshotDir: resolveSnapshotDir(options, root),
    mode: resolveBaselinePathMode(options),
    storyIds: [storyId],
  });
  invalidateWarmStaticStorybookServer();
  const response: VisualDeltaStoryConfigUpdateResponse & {
    sourceUpdated?: boolean;
    changes?: VisualDeltaChangeSetMutation;
  } = {
    ok: true,
    storyId,
    values,
    unset,
    sourceUpdated: result.sourceUpdated,
    changes: await mutation.finish({ success: true }),
  };
  writeJson(res, 200, response);
}

async function handlePlaywrightThreshold(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: { passThresholdPercent?: unknown };
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (
    typeof body.passThresholdPercent !== "number" ||
    !Number.isFinite(body.passThresholdPercent)
  ) {
    writeJson(res, 400, {
      ok: false,
      error: "passThresholdPercent must be a finite number",
    });
    return;
  }
  const mutation = await changeSets.begin({
    action: "playwright-threshold",
    scope: "project threshold",
    expectedPaths: [".visual-delta/playwright.json"],
    workflow: workflowFor(root),
  });
  try {
    const written = writePlaywrightPassThresholdPercent(
      root,
      body.passThresholdPercent,
    );
    writeJson(res, 200, {
      ok: true,
      ...written,
      playwrightPassThresholdPercent: written.passThresholdPercent,
      changes: await mutation.finish({ success: true }),
    });
  } catch (error) {
    const changes = await mutation.finish({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    writeJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      changes,
    });
  }
}

async function handleInit(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
  changeSets: VisualDeltaChangeSetStore,
) {
  void req;
  let mutation: Awaited<ReturnType<VisualDeltaChangeSetStore["begin"]>> | null =
    null;
  try {
    mutation = await changeSets.begin({
      action: "init",
      scope: "Visual Delta setup",
      expectedPaths: [
        ".gitignore",
        "package.json",
        "playwright.config.ts",
        "tests/visual/storybook.spec.ts",
        `${relativeToRoot(root, resolveSnapshotDir(options, root)) ?? "tests/visual/storybook.spec.ts-snapshots"}/.gitkeep`,
      ],
      workflow: workflowFor(root),
      forceReview: true,
    });
    const result = runVisualDeltaInit({
      packageRoot: root,
      port: visualPort,
      force: false,
    });
    writeJson(res, 200, {
      ...result,
      onboarding: inspectVisualDeltaOnboarding(root, result.snapshotDir),
      changes: await mutation.finish({ success: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const changes = await mutation
      ?.finish({
        success: false,
        error: message,
      })
      .catch(() => undefined);
    writeJson(res, 500, {
      ok: false,
      error: message,
      ...(changes ? { changes } : {}),
    });
  }
}

async function handleCaptureSubject(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
) {
  let body: CaptureSubjectRequest;
  try {
    body = await readJsonBody<CaptureSubjectRequest>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  beginNdjson(res);
  const write = (event: CaptureSubjectStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
    const flushable = res as ServerResponse & { flush?: () => void };
    flushable.flush?.();
  };

  // Client abort (Diff Stop) closes the request; stop emitting further events.
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
  });

  const browser = body.browser ?? "chromium";
  const projectConfig = readVisualDeltaProjectConfig(root);
  const projectConfigError = projectConfig.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (projectConfigError) {
    write({ type: "error", error: projectConfigError.message });
    res.end();
    return;
  }
  if (!projectConfig.browsers.includes(browser)) {
    write({
      type: "error",
      error: `Browser ${browser} is not enabled in project configuration.`,
    });
    res.end();
    return;
  }
  write({
    type: "start",
    storyId: body.storyId,
    target: { browser },
    environment: {
      browser,
      platform: process.platform,
    },
  });
  try {
    const result = await captureSubjectWithBrowser(body, (progress) => {
      if (!clientClosed) write({ type: "progress", ...progress });
    });
    if (!clientClosed) write({ type: "done", ...result });
  } catch (error) {
    if (!clientClosed) {
      write({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!res.writableEnded) res.end();
}

async function handleCompareStory(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  changeSets: VisualDeltaChangeSetStore,
) {
  let body: CompareStoryRequest;
  try {
    body = await readJsonBody<CompareStoryRequest>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  beginNdjson(res);
  const write = (event: CompareStoryStreamEvent) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
    const flushable = res as ServerResponse & { flush?: () => void };
    flushable.flush?.();
  };
  write({
    type: "start",
    storyId: body.storyId,
    target: { browser: body.browser ?? "chromium" },
  });
  try {
    const result = await compareStoryInCaptureRunner({
      root,
      hostOptions: options,
      request: body,
      onProgress: (progress) => write({ type: "progress", ...progress }),
      onLog: (line) => write({ type: "log", line }),
    });
    const workflow = workflowFor(root);
    const outcome = classifyVisualRunResult({
      status: result.sidecar.status,
      sidecar: result.sidecar,
      outcome: result.sidecar.outcome,
      error: result.sidecar.error,
    });
    const fullConfiguredBrowserMatrix =
      readVisualDeltaProjectConfig(root).browsers.length === 1;
    if (
      fullConfiguredBrowserMatrix &&
      shouldAutoAcceptLiveStoryComparison(workflow, outcome)
    ) {
      const mutation = await changeSets.begin({
        action: "auto-accept",
        scope: result.storyId,
        storyIds: [result.storyId],
        expectedPaths: storySourcePaths(root, [result.storyId]),
        workflow,
      });
      const review = patchStoryVisualReviewStatus({
        packageRoot: root,
        storyId: result.storyId,
        status: "approved",
      });
      const changes = await mutation.finish({
        success: review.ok,
        ...(review.error ? { error: review.error } : {}),
      });
      write({
        type: "done",
        ...result,
        review: {
          autoAccepted: true,
          applied: review.ok,
          status: "approved",
          ...(review.error ? { error: review.error } : {}),
          changes,
        },
      });
    } else {
      write({ type: "done", ...result });
    }
  } catch (error) {
    write({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!res.writableEnded) res.end();
}

/**
 * Dev-only Visual Delta endpoints:
 * - POST /__visual-delta/update-baseline — regenerate baselines (overwrite)
 * - POST /__visual-delta/create-baseline — create missing baselines only
 * - POST /__visual-delta/rebuild-static — run build-storybook only (no capture)
 * - POST /__visual-delta/create-interaction-baseline — mid-play step capture
 * - POST /__visual-delta/capture-subject — Playwright Chromium subject PNG
 * - POST /__visual-delta/compare-story — authoritative live story comparison
 * - POST /__visual-delta/run-tests — run Playwright visual suite (no updates)
 * - GET  /__visual-delta/affected-plan — plan affected stories without capture
 * - GET  /__visual-delta/run-events — replay / continue an in-flight or recent run
 * - GET  /__visual-delta/run-status — lightweight phase/progress JSON
 * - POST /__visual-delta/cancel-tests — stop an in-flight run
 * - POST /__visual-delta/action-scope — freeze visible / affected story ids
 * - POST /__visual-delta/review-status — set visual review tag (pending/approved/ready/failed)
 * - POST /__visual-delta/skip-visual — add or remove skip-visual on a story
 * - GET  /__visual-delta/runtime — stable identity for this dev server instance
 * - GET  /__visual-delta/baseline-history — committed PNG revisions
 * - GET  /__visual-delta/baseline-history/image — one historical PNG
 * - GET  /__visual-delta/baseline-history/diff — component-folder source diff
 * - GET  /__visual-delta/config — resolved host options
 * - PUT  /__visual-delta/config — persist allow-listed project defaults
 * - PUT  /__visual-delta/story-configuration — persist exact-story overrides
 * - POST /__visual-delta/story-facts — resolve primary-baseline coverage
 * - POST /__visual-delta/playwright-threshold — write host Playwright pass %
 * - POST /__visual-delta/init — scaffold portable Playwright suite/config
 * - GET  /__visual-delta/change-sets — recent UI-driven mutations
 * - GET  /__visual-delta/change-set-file — stable before/after file bytes
 * - POST /__visual-delta/change-set-commit — commit one complete safe change set
 */
export function visualDeltaMiddlewarePlugin(
  options: VisualDeltaHostOptions = {},
): Plugin {
  const runtime = createVisualDeltaRuntimeEndpoint();

  return {
    name: "visual-delta-middleware",
    configureServer(server) {
      const root = resolveRoot(options, server.config.root);
      const changeSets = new VisualDeltaChangeSetStore(
        root,
        options.allowVcsWrites === true,
      );
      const baselineHistory = createBaselineHistoryEndpoint({
        root,
        hostOptions: options,
      });
      const storybookPort =
        typeof server.config.server?.port === "number"
          ? server.config.server.port
          : resolveStorybookPort();
      const visualPort = resolveVisualServerPort(options, storybookPort);
      const managerAffectedPlan = createInvalidatableCache(() =>
        affectedPlan(root, options),
      );
      server.watcher.on("all", (event, filePath) => {
        if (
          (event === "add" || event === "change" || event === "unlink") &&
          affectsAffectedPlan(root, filePath)
        ) {
          managerAffectedPlan.invalidate();
        }
      });
      // Warm storybook-static (Storybook port + 1 by default) for Testing Module.
      void ensureWarmStaticStorybookServer(root, visualPort).catch(() => {
        /* non-fatal — Playwright can still start its own webServer */
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";

        if (url === VISUAL_DELTA_RUNTIME_PATH) {
          runtime.handle(req.method, res);
          return;
        }

        if (url === VISUAL_DELTA_CHANGE_SETS_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          writeJson(res, 200, changeSets.list());
          return;
        }

        if (url === VISUAL_DELTA_CHANGE_SET_FILE_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          const parsed = new URL(req.url ?? "/", "http://visual-delta.local");
          const changeSetId = parsed.searchParams.get("changeSetId") ?? "";
          const relativePath = parsed.searchParams.get("path") ?? "";
          const phase = parsed.searchParams.get("phase");
          if (phase !== "before" && phase !== "after") {
            writeJson(res, 400, { ok: false, error: "Invalid file phase." });
            return;
          }
          try {
            const file = changeSets.file(changeSetId, relativePath, phase);
            if (!file) {
              writeJson(res, 404, {
                ok: false,
                error: "Change-set file was not found.",
              });
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", file.contentType);
            res.setHeader("Cache-Control", "no-store");
            res.end(file.bytes);
          } catch (error) {
            writeJson(res, 400, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }

        if (url === VISUAL_DELTA_CHANGE_SET_COMMIT_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          let changeSetId = "";
          try {
            const body = await readJsonBody<{
              changeSetId?: string;
              message?: string;
            }>(req);
            changeSetId = body.changeSetId?.trim() ?? "";
            const changeSet = await changeSets.commit(
              changeSetId,
              body.message ?? "",
            );
            writeJson(res, 200, { ok: true, changeSet });
          } catch (error) {
            const changeSet = changeSets.get(changeSetId);
            writeJson(res, 400, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              ...(changeSet ? { changeSet } : {}),
            });
          }
          return;
        }

        if (
          await baselineHistory.handle(
            req,
            res,
            new URL(req.url ?? "/", "http://visual-delta.local"),
          )
        ) {
          return;
        }

        if (url === VISUAL_DELTA_STORY_FACTS_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleStoryFacts(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_CONFIG_PATH) {
          if (req.method === "GET") {
            handleConfigGet(res, root, options, visualPort);
            return;
          }
          if (req.method === "PUT") {
            if (
              await handleConfigPut(
                req,
                res,
                root,
                options,
                visualPort,
                changeSets,
              )
            ) {
              server.ws.send({
                type: "custom",
                event: "visual-delta-config-updated",
                data: resolvedConfigPayload(root, options, visualPort),
              });
            }
            return;
          }
          {
            res.statusCode = 405;
            res.setHeader("Allow", "GET, PUT");
            res.end("Method Not Allowed");
            return;
          }
        }

        if (url === VISUAL_DELTA_STORY_CONFIG_PATH) {
          if (req.method !== "PUT") {
            res.statusCode = 405;
            res.setHeader("Allow", "PUT");
            res.end("Method Not Allowed");
            return;
          }
          await handleStoryConfigPut(req, res, root, options, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handlePlaywrightThreshold(req, res, root, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_INIT_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleInit(req, res, root, options, visualPort, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_REBUILD_STATIC_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleRebuildStatic(res, root, visualPort);
          return;
        }

        if (url === VISUAL_DELTA_UPDATE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleBaselineWrite(
            req,
            res,
            root,
            "update",
            options,
            changeSets,
          );
          return;
        }

        if (url === VISUAL_DELTA_CREATE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleBaselineWrite(
            req,
            res,
            root,
            "create",
            options,
            changeSets,
          );
          return;
        }

        if (url === VISUAL_DELTA_CREATE_INTERACTION_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleInteractionBaselineWrite(
            req,
            res,
            root,
            options,
            changeSets,
          );
          return;
        }

        if (url === VISUAL_DELTA_DELETE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleDeleteBaseline(req, res, root, options, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_CAPTURE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleCaptureSubject(req, res, root);
          return;
        }

        if (url === VISUAL_DELTA_COMPARE_STORY_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleCompareStory(req, res, root, options, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_REVIEW_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleReviewStatus(req, res, root, options, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_SKIP_VISUAL_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleSkipVisual(req, res, root, options, changeSets);
          return;
        }

        if (url === VISUAL_DELTA_RUN_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleRun(req, res, root, options, visualPort);
          return;
        }

        if (url === VISUAL_DELTA_AFFECTED_PLAN_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          handleAffectedPlan(res, root, options, managerAffectedPlan.get());
          return;
        }

        if (url === VISUAL_DELTA_ACTION_SCOPE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleActionScope(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_RUN_EVENTS_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          handleRunEvents(res);
          return;
        }

        if (url === VISUAL_DELTA_RUN_STATUS_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          handleRunStatus(res);
          return;
        }

        if (url === VISUAL_DELTA_CANCEL_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          handleCancel(res);
          return;
        }

        next();
      });
    },
  };
}
