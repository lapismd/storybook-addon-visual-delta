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
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";
import {
  modeResultStatus,
  type VisualModeRunResult,
} from "../shared/mode-results.js";
import {
  captureSubjectWithChromium,
  type CaptureSubjectRequest,
} from "./capture-subject.js";
import type { CaptureSubjectStreamEvent } from "../shared/capture-subject-types.js";
import type {
  CompareStoryRequest,
  CompareStoryStreamEvent,
} from "../shared/compare-story-types.js";
import { compareLiveStoryWithChromium } from "./compare-story.js";
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
import type {
  VisualStoryDescriptor,
  VisualStoryFactsRequest,
  VisualStoryFactsResponse,
} from "../shared/story-facts.js";
import { resolveVisualStoryFacts } from "./story-facts.js";
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
  loadModeSidecarsForStoryId,
  loadSidecarForStoryId,
} from "./visual-sidecars.js";
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
  readVisualDeltaProjectConfig,
  writeVisualDeltaProjectConfig,
} from "./project-config.js";
import {
  beginVisualRunHub,
  getVisualRunHubStatus,
  isVisualRunActive,
  publishVisualRunEvent,
  resetVisualRunHub,
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

type UpdateBody = {
  /** Exact story ids to write in one Playwright invocation. */
  storyIds?: string[];
  /** Legacy single-story input. */
  storyId?: string;
  component?: string;
  /** Force build-storybook before capture (strips host --skip-build). */
  rebuild?: boolean;
};

type InteractionUpdateBody = {
  storyId?: string;
  /** Human step label from `step("…")`. */
  stepLabel?: string;
  /** Optional pre-slugified id; defaults to slugify(stepLabel). */
  stepId?: string;
  /** Overwrite an existing interaction PNG. */
  overwrite?: boolean;
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
};

export type {
  VisualRunResponse,
  VisualRunResultItem,
  VisualRunStreamEvent,
} from "./run-hub.js";

let activeRun: ChildProcess | null = null;
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
  const response: VisualStoryFactsResponse = {
    ok: true,
    version: 2,
    generatedAt: Date.now(),
    stories: resolveVisualStoryFacts(
      stories,
      resolveSnapshotDir(options, root),
      resolveBaselinePathMode(options),
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

type PlaywrightJsonSpec = {
  title?: string;
  ok?: boolean;
  tests?: Array<{
    status?: string;
    results?: Array<{ status?: string; error?: { message?: string } }>;
  }>;
  suites?: PlaywrightJsonSuite[];
};

type PlaywrightJsonSuite = {
  title?: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
};

function walkSpecs(
  suite: PlaywrightJsonSuite,
  out: VisualRunResultItem[],
): void {
  for (const spec of suite.specs ?? []) {
    const storyId = spec.title?.trim();
    if (!storyId) continue;
    const test = spec.tests?.[0];
    const result = test?.results?.[0];
    const raw =
      result?.status ?? test?.status ?? (spec.ok ? "passed" : "failed");
    let status: VisualRunResultItem["status"] = "failed";
    if (raw === "passed" || raw === "expected" || spec.ok === true) {
      status = "passed";
    } else if (raw === "skipped" || raw === "pending") {
      status = "skipped";
    } else if (raw === "timedOut") {
      status = "timedOut";
    }
    out.push({
      storyId,
      status,
      title: storyId,
      error: result?.error?.message,
    });
  }
  for (const child of suite.suites ?? []) {
    walkSpecs(child, out);
  }
}

function parsePlaywrightJson(raw: string): VisualRunResultItem[] {
  const report = JSON.parse(raw) as { suites?: PlaywrightJsonSuite[] };
  const results: VisualRunResultItem[] = [];
  for (const suite of report.suites ?? []) {
    walkSpecs(suite, results);
  }
  return results;
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
    const sidecar = loadSidecarForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
    );
    const hasBaseline = baselinePngExistsForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
    );
    const modeSidecars = loadModeSidecarsForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
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
            `-chromium-${process.platform}.png`,
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
    let next: VisualRunResultItem = sidecar
      ? { ...item, sidecar, modeResults }
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

function extractJsonDocument(log: string): string | null {
  const start = log.indexOf("{");
  const end = log.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return log.slice(start, end + 1);
}

function summarize(results: VisualRunResultItem[]) {
  const summary = { total: results.length, passed: 0, failed: 0, skipped: 0 };
  for (const item of results) {
    if (item.status === "passed") summary.passed++;
    else if (item.status === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

export function visualTestCommandArgs(
  options: VisualDeltaHostOptions = {},
  grep?: string,
): string[] {
  // List-only: pairing `--reporter=json` on stdout suppresses list lines (or
  // downgrades to line reporter), so the Testing Module stays at 0/N until done.
  return [
    ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
    "--reporter=list",
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
        log = log.slice(-160_000);
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

  const createOnly = mode === "create";
  const rebuild = Boolean(body.rebuild);
  const baseArgs = options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS];
  const args = [
    ...(rebuild ? baseArgs.filter((arg) => arg !== "--skip-build") : baseArgs),
    ...(rebuild ? ["--rebuild"] : []),
    ...(createOnly ? ["--create-only"] : []),
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
    res.write(`\n[exit ${code}]\n`);
  } catch (error) {
    res.write(
      `\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  res.end();
}

async function handleInteractionBaselineWrite(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
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
  if (!storyId || !stepLabel) {
    res.statusCode = 400;
    res.end("Provide storyId and stepLabel");
    return;
  }

  const baseArgs = options.visualInteractionUpdateArgs ?? [
    ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  ];
  const args = [
    ...baseArgs,
    ...(body.overwrite ? [] : ["--create-only"]),
    "--story-id",
    storyId,
    "--step-label",
    stepLabel,
    ...(stepId ? ["--step-id", stepId] : []),
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
    res.write(`\n[exit ${code}]\n`);
  } catch (error) {
    res.write(
      `\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
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
  if (activeRun || isVisualRunActive()) {
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

  const allowRebuild = options.allowRebuild !== false;
  if (selection === "affected" && !allowRebuild) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: "Affected visual tests require static Storybook rebuilds",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
      affected,
    } satisfies VisualRunResponse);
    return;
  }
  const forceReason =
    selection === "affected"
      ? ("affected-plan" as const)
      : body.rebuild
        ? ("explicit-rebuild" as const)
        : (staticStaleReason ?? undefined);
  const buildDecision = decideStorybookStaticBuild({
    packageRoot: root,
    skipBuild: !allowRebuild,
    forceRebuild: Boolean(forceReason),
    forceReason,
    storyIdPrefix: "",
    storyIds: selectedStoryIds,
  });
  if (buildDecision.shouldBuild && !allowRebuild) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: buildDecision.message,
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
      affected,
    } satisfies VisualRunResponse);
    return;
  }
  if (buildDecision.reason === "skip-build-missing") {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: buildDecision.message,
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
      affected,
    } satisfies VisualRunResponse);
    return;
  }
  const rebuild = buildDecision.shouldBuild;
  let grep =
    selection === "all" ? undefined : grepFromStoryIds(selectedStoryIds);
  let log = "";

  beginVisualRunHub();
  subscribeVisualRunHub(res);
  emitRun({
    type: "start",
    total:
      countVisualStories(root, selectedStoryIds) ??
      selectedStoryIds?.length ??
      0,
    affected,
  });

  try {
    if (rebuild) {
      const rebuildLine = buildDecision.message;
      emitRun({ type: "log", line: rebuildLine });
      log += `${rebuildLine}\n`;
      const rebuildStartedAt = Date.now();
      const heartbeat = setInterval(() => {
        emitRun({
          type: "log",
          line: `${rebuildLine}… ${Math.floor(
            (Date.now() - rebuildStartedAt) / 1_000,
          )}s`,
        });
      }, 5_000);
      let built: Awaited<ReturnType<typeof runCommand>>;
      try {
        built = await runStaticBuildSingleFlight(root, () =>
          runCommand("pnpm", ["build-storybook"], root),
        );
      } finally {
        clearInterval(heartbeat);
      }
      log += built.log;
      if (built.code !== 0) {
        emitRun({
          type: "error",
          error: "build-storybook failed",
          crashed: true,
        });
        emitRun({
          type: "done",
          ok: false,
          crashed: true,
          error: "build-storybook failed",
          exitCode: built.code,
          rebuild,
          grep,
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          logTail: log.slice(-4000),
          affected,
        });
        return;
      }
      staticStaleReason = null;
      markStorybookStaticFresh(root);
      invalidateWarmStaticStorybookServer();

      if (selection === "affected") {
        plan = affectedPlan(root, options);
        selectedStoryIds = plan.selectedStoryIds;
        affected = plan.summary;
        grep = affected.fallbackReason
          ? undefined
          : grepFromStoryIds(selectedStoryIds);
        if (affected.noChange) {
          recordAffectedVisualResults({
            root,
            hostOptions: options,
            passedStoryIds: [],
          });
          emitRun({ type: "start", total: 0, affected });
          emitRun({
            type: "done",
            ok: true,
            exitCode: 0,
            rebuild,
            summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
            results: [],
            logTail: `${log}Affected visual tests are up to date`.slice(-6000),
            affected,
          });
          return;
        }
      } else {
        affected = selectedRunSummary(
          root,
          options,
          selectedStoryIds,
          selection,
        );
      }
    } else if (isStorybookStaticComplete(root)) {
      emitRun({
        type: "log",
        line: "Using existing storybook-static",
      });
      log += "Using existing storybook-static\n";
    }

    const total = countVisualStories(root, selectedStoryIds);
    emitRun({ type: "start", total, affected });

    const seenIndexes = new Set<number>();
    const progressResults: VisualRunResultItem[] = [];
    let completed = 0;
    let passed = 0;
    let failed = 0;
    let lineBuf = "";

    const warm = await ensureWarmStaticStorybookServer(root, visualPort);
    if (warm.message) {
      emitRun({ type: "log", line: warm.message });
      log += `${warm.message}\n`;
    }
    if (!warm.ok) {
      await ensurePlaywrightWebServerPort(visualPort);
    }

    const args = visualTestCommandArgs(options, grep);
    const { code, log: runLog } = await runCommand(
      "pnpm",
      args,
      root,
      {
        PLAYWRIGHT_UPDATE_SNAPSHOTS: "0",
        // Keep Playwright webServer on the same port the middleware warmed.
        VISUAL_SERVER_PORT: String(visualPort),
      },
      (chunk) => {
        lineBuf += chunk;
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() ?? "";
        for (const line of lines) {
          for (const item of parseListReporterProgress(`${line}\n`)) {
            if (seenIndexes.has(item.index)) continue;
            seenIndexes.add(item.index);
            completed = seenIndexes.size;
            if (item.status === "passed") passed += 1;
            else failed += 1;
            progressResults.push({
              storyId: item.storyId,
              status: item.status,
              title: item.storyId,
            });
            emitRun({
              type: "progress",
              completed,
              total: total || completed,
              passed,
              failed,
              storyId: item.storyId,
              status: item.status,
            });
          }
        }
      },
    );
    log += runLog;

    // Prefer list-reporter results (live progress). Fall back to a JSON document
    // in the log when a host still wires `--reporter=json` without a file sink.
    let results: VisualRunResultItem[] = [];
    if (progressResults.length > 0) {
      results = attachSidecars(progressResults, root, options);
    } else {
      const json = extractJsonDocument(runLog);
      if (json) {
        try {
          results = attachSidecars(parsePlaywrightJson(json), root, options);
        } catch {
          /* leave empty — UI still shows crash/fail via exit code */
        }
      }
    }

    const summary = summarize(results);
    // List-reporter progress is authoritative when result parsing yielded nothing,
    // so the UI does not show "Ran 0 tests".
    if (summary.total === 0 && completed > 0) {
      summary.total = completed;
      summary.passed = passed;
      summary.failed = failed;
    }
    const passedStoryIds =
      code === 0
        ? (selectedStoryIds ?? [])
        : successfulStoryIdsFromPlaywrightResults({
            root,
            hostOptions: options,
            results,
          });
    recordAffectedVisualResults({
      root,
      hostOptions: options,
      passedStoryIds,
    });
    emitRun({
      type: "done",
      ok: code === 0 && summary.failed === 0,
      exitCode: code,
      rebuild,
      grep,
      summary,
      results,
      logTail: log.slice(-6000),
      affected,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitRun({ type: "error", error: message, crashed: true });
    emitRun({
      type: "done",
      ok: false,
      crashed: true,
      error: message,
      exitCode: 1,
      rebuild,
      grep,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: log.slice(-4000),
      affected,
    });
  }
}

function handleCancel(res: ServerResponse) {
  if (!activeRun) {
    resetVisualRunHub();
    writeJson(res, 200, { ok: true, cancelled: false });
    return;
  }
  activeRun.kill("SIGTERM");
  activeRun = null;
  resetVisualRunHub();
  writeJson(res, 200, { ok: true, cancelled: true });
}

function handleAffectedPlan(
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
): void {
  const plan = affectedPlan(root, options);
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
  if (activeRun || isVisualRunActive()) {
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
        logTail: built.log.slice(-4000),
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
  writeJson(res, 200, getVisualRunHubStatus());
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
    writeJson(res, 200, { ok: errors.length === 0, updated, errors });
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

  const result = patchStoryVisualReviewStatus({
    packageRoot: root,
    storyId,
    status,
  });
  writeJson(res, result.ok ? 200 : 400, result);
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
  writeJson(res, result.ok ? 200 : 400, result);
}

async function handleDeleteBaseline(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
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

  try {
    const result = deleteVisualBaseline(root, options, {
      storyId: body.storyId ?? "",
      baselineUrl: body.baselineUrl ?? "",
      interactionId: body.interactionId,
    });
    writeJson(res, 200, result);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error:
        error instanceof Error ? error.message : "Delete screenshot failed",
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
): Promise<boolean> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
    const defaults =
      typeof body === "object" && body != null && "projectDefaults" in body
        ? (body as { projectDefaults: unknown }).projectDefaults
        : body;
    writeVisualDeltaProjectConfig(root, defaults);
    invalidateVisualResultArtifacts({
      packageRoot: root,
      snapshotDir: resolveSnapshotDir(options, root),
      mode: resolveBaselinePathMode(options),
    });
    staticStaleReason = "stale-config";
    invalidateStorybookStaticFreshness(root);
    invalidateWarmStaticStorybookServer();
    writeJson(res, 200, resolvedConfigPayload(root, options, visualPort));
    return true;
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function handleStoryConfigPut(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
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
  const result = patchStoryVisualDeltaConfig({
    packageRoot: root,
    storyId,
    values,
    unset,
  });
  if (!result.ok) {
    writeJson(res, 400, result);
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
  } = {
    ok: true,
    storyId,
    values,
    unset,
    sourceUpdated: result.sourceUpdated,
  };
  writeJson(res, 200, response);
}

async function handlePlaywrightThreshold(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
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
  try {
    const written = writePlaywrightPassThresholdPercent(
      root,
      body.passThresholdPercent,
    );
    writeJson(res, 200, {
      ok: true,
      ...written,
      playwrightPassThresholdPercent: written.passThresholdPercent,
    });
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleInit(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
) {
  void req;
  const result = runVisualDeltaInit({
    packageRoot: root,
    port: visualPort,
    force: false,
  });
  writeJson(res, 200, {
    ...result,
    onboarding: inspectVisualDeltaOnboarding(root, result.snapshotDir),
  });
}

async function handleCaptureSubject(req: IncomingMessage, res: ServerResponse) {
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

  write({ type: "start", storyId: body.storyId });
  try {
    const result = await captureSubjectWithChromium(body, (progress) => {
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
  write({ type: "start", storyId: body.storyId });
  try {
    const result = await compareLiveStoryWithChromium({
      root,
      hostOptions: options,
      request: body,
      onProgress: (progress) => write({ type: "progress", ...progress }),
    });
    write({ type: "done", ...result });
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
 */
export function visualDeltaMiddlewarePlugin(
  options: VisualDeltaHostOptions = {},
): Plugin {
  const runtime = createVisualDeltaRuntimeEndpoint();

  return {
    name: "visual-delta-middleware",
    configureServer(server) {
      const root = resolveRoot(options, server.config.root);
      const baselineHistory = createBaselineHistoryEndpoint({
        root,
        hostOptions: options,
      });
      const storybookPort =
        typeof server.config.server?.port === "number"
          ? server.config.server.port
          : resolveStorybookPort();
      const visualPort = resolveVisualServerPort(options, storybookPort);
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
            if (await handleConfigPut(req, res, root, options, visualPort)) {
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
          await handleStoryConfigPut(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handlePlaywrightThreshold(req, res, root);
          return;
        }

        if (url === VISUAL_DELTA_INIT_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          handleInit(req, res, root, options, visualPort);
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
          await handleBaselineWrite(req, res, root, "update", options);
          return;
        }

        if (url === VISUAL_DELTA_CREATE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleBaselineWrite(req, res, root, "create", options);
          return;
        }

        if (url === VISUAL_DELTA_CREATE_INTERACTION_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleInteractionBaselineWrite(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_DELETE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleDeleteBaseline(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_CAPTURE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleCaptureSubject(req, res);
          return;
        }

        if (url === VISUAL_DELTA_COMPARE_STORY_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleCompareStory(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_REVIEW_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleReviewStatus(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_SKIP_VISUAL_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleSkipVisual(req, res, root, options);
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
          handleAffectedPlan(res, root, options);
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
