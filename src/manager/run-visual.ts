import { experimental_getStatusStore, type API } from "storybook/manager-api";
import { buildArgsParam } from "storybook/internal/router";
import {
  STATUS_TYPE_ID_VISUAL,
  VISUAL_DEVICE_SCALE_FACTOR,
  VISUAL_DELTA_ACTION_SCOPE_PATH,
  VISUAL_DELTA_AFFECTED_PLAN_PATH,
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_CONFIG_PATH,
  VISUAL_DELTA_CREATE_INTERACTION_PATH,
  VISUAL_DELTA_CREATE_PATH,
  VISUAL_DELTA_DELETE_PATH,
  VISUAL_DELTA_INIT_PATH,
  VISUAL_DELTA_REBUILD_STATIC_PATH,
  VISUAL_DELTA_REVIEW_PATH,
  VISUAL_DELTA_RUN_EVENTS_PATH,
  VISUAL_DELTA_RUN_PATH,
  VISUAL_DELTA_RUN_STATUS_PATH,
  VISUAL_DELTA_SKIP_VISUAL_PATH,
  VISUAL_DELTA_STORY_CONFIG_PATH,
  VISUAL_DELTA_UPDATE_PATH,
  VISUAL_VIEWPORT,
  type VisualDeltaParams,
  type VisualReviewStatus,
} from "../constants.js";
import type {
  AffectedVisualSummary,
  VisualActionScopeProgress,
  VisualActionScopeResponse,
  VisualActionScopeStreamEvent,
  VisualRunSelectionMode,
} from "../shared/affected-types.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import type { CompareStoryResult } from "../shared/compare-story-types.js";
import {
  announceVisualDeltaChanges,
  parseVisualDeltaChangeMarker,
} from "../shared/change-events.js";
import type { VisualDeltaChangeSetMutation } from "../shared/change-sets.js";
import type {
  VisualDeltaStoryConfigUpdate,
  VisualDeltaStoryConfigUpdateResponse,
} from "../shared/story-config.js";
import type { VisualModeRunResult } from "../shared/mode-results.js";
import {
  classifyVisualRunResult,
  type VisualComparisonOutcome,
} from "../shared/visual-result-classification.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import { baselineUrlForStoryRef } from "../shared/baseline-url.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import { postBrowserStoryCompare } from "../panel/chromium-capture.js";
import type {
  VisualBaselineEnvironment,
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "../shared/environments.js";
import { parseVisualBaselineEnvironment } from "../shared/environments.js";
import type { VisualComparisonPolicyStatus } from "../visual-diff-sidecar.js";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  type VisualCaptureProfile,
} from "../shared/capture-profile.js";

export type VisualRunResultItem = {
  storyId: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  title: string;
  error?: string;
  sidecar?: VisualDiffSidecar;
  modeResults?: VisualModeRunResult[];
  /** Set when the story failed because no committed baseline PNG exists. */
  missingBaseline?: boolean;
  /** Normalized outcome when restored from Storybook's status store. */
  outcome?: VisualComparisonOutcome;
  target?: VisualBaselineTarget;
  captureProfile?: VisualCaptureProfile;
  /** @deprecated Canonical lookup uses target.browser only. */
  environment?: VisualBaselineEnvironment;
  policyStatus?: VisualComparisonPolicyStatus;
  /** Optional review mutation produced by authoritative live auto-approval. */
  review?: CompareStoryResult["review"];
};

/** Middleware / patcher message when refusing visual-failed without a PNG. */
export const NO_BASELINE_FAILED_ERROR =
  "Cannot mark failed — no baseline screenshot";

export function isMissingBaselineFailure(item: VisualRunResultItem): boolean {
  return classifyVisualRunResult(item) === "missing-baseline";
}

export type ReviewUpdatesFromRunResultsOptions = {
  /**
   * Current CSF review status for a story. When a story is already approved,
   * pass / within-tolerance must not demote it to ready.
   */
  currentReviewStatus?: (
    storyId: string,
  ) => VisualReviewStatus | null | undefined;
};

/**
 * Map completed comparisons to review tags.
 * Runner errors, missing baselines, and skips never change review state.
 * Already-approved stories stay approved when they still pass.
 */
export function reviewUpdatesFromRunResults(
  results: VisualRunResultItem[],
  options?: ReviewUpdatesFromRunResultsOptions,
): Array<{ storyId: string; status: VisualReviewStatus }> {
  const updates: Array<{ storyId: string; status: VisualReviewStatus }> = [];
  const grouped = new Map<string, VisualRunResultItem[]>();
  for (const result of results) {
    grouped.set(result.storyId, [
      ...(grouped.get(result.storyId) ?? []),
      result,
    ]);
  }
  for (const [storyId, storyResults] of grouped) {
    const outcomes = storyResults.map(classifyVisualRunResult);
    const clean = storyResults.every(
      (item, index) =>
        item.policyStatus !== "warning" &&
        (outcomes[index] === "passed" ||
          outcomes[index] === "changed-within-tolerance"),
    );
    if (clean) {
      if (options?.currentReviewStatus?.(storyId) === "approved") {
        continue;
      }
      updates.push({ storyId, status: "ready" });
    }
    if (outcomes.includes("mismatch")) {
      updates.push({ storyId, status: "failed" });
    }
  }
  return updates;
}

export function isNoBaselineFailedReviewError(error: string): boolean {
  return error.toLowerCase().includes("no baseline screenshot");
}

export type VisualRunResponse = {
  ok: boolean;
  exitCode: number;
  crashed?: boolean;
  error?: string;
  /** True when the run was aborted via cancel before a natural terminal result. */
  cancelled?: boolean;
  rebuild: boolean;
  grep?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warnings?: number;
  };
  results: VisualRunResultItem[];
  logTail: string;
  affected?: AffectedVisualSummary;
  browsers?: VisualDeltaBrowser[];
  captureProfile?: VisualCaptureProfile;
  /** Set when `/run-events` reports no active or recent run. */
  idle?: boolean;
};

export type VisualRunProgress = {
  completed: number;
  total: number;
  passed: number;
  failed: number;
  warnings?: number;
  storyId?: string;
  status?: "passed" | "failed";
  target?: VisualBaselineTarget;
  captureProfile?: VisualCaptureProfile;
  environment?: VisualBaselineEnvironment;
  affected?: AffectedVisualSummary;
};

export type VisualRunStreamEvent =
  | { type: "idle" }
  | {
      type: "start";
      total: number;
      affected?: AffectedVisualSummary;
      captureProfile?: VisualCaptureProfile;
    }
  | ({ type: "progress" } & VisualRunProgress)
  | { type: "log"; line: string }
  | ({ type: "done" } & VisualRunResponse)
  | { type: "error"; error: string; crashed?: boolean };

const LAST_RUN_STORAGE_KEY = "visual-delta:last-run";
const STATUS_JOB_STORAGE_KEY = "visual-delta:status-job";
const CREATE_PROGRESS_STORAGE_KEY = "visual-delta:create-progress";

/** Survives manager HMR so Update status / remounts can restore the summary. */
function persistVisualLastRun(lastRun: VisualLastRunSummary | null) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!lastRun) sessionStorage.removeItem(LAST_RUN_STORAGE_KEY);
    else sessionStorage.setItem(LAST_RUN_STORAGE_KEY, JSON.stringify(lastRun));
  } catch {
    /* private mode / quota */
  }
}

export function loadPersistedVisualLastRun(): VisualLastRunSummary | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(LAST_RUN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VisualLastRunSummary;
  } catch {
    return null;
  }
}

export type VisualStatusJob = {
  updates: Array<{ storyId: string; status: VisualReviewStatus }>;
};

function persistVisualStatusJob(job: VisualStatusJob | null) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!job) sessionStorage.removeItem(STATUS_JOB_STORAGE_KEY);
    else sessionStorage.setItem(STATUS_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    /* ignore */
  }
}

export function loadPersistedVisualStatusJob(): VisualStatusJob | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(STATUS_JOB_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VisualStatusJob;
  } catch {
    return null;
  }
}

export function clearPersistedVisualStatusJob() {
  persistVisualStatusJob(null);
}

/** Test helper — seed a persisted status job. */
export function persistVisualStatusJobForTests(job: VisualStatusJob | null) {
  persistVisualStatusJob(job);
}

type LogListener = (line: string) => void;
const logListeners = new Set<LogListener>();

/** Subscribe to streamed status lines (build reuse / warm server / etc.). */
export function subscribeVisualRunLog(listener: LogListener) {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

function emitVisualRunLog(line: string) {
  for (const listener of logListeners) {
    listener(line);
  }
}

export type VisualRunScope = "story" | "component" | "affected" | "all";

export type VisualLastRunSummary = {
  finishedAt: number;
  summary: VisualRunResponse["summary"];
  /** False when the runner crashed before producing a completed run. */
  completed?: boolean;
  error?: string;
  scope?: VisualRunScope;
  /** Trailing Playwright / middleware log for the panel status popover. */
  logTail?: string;
  /** Per-story outcomes for Update status / follow-up actions. */
  results?: VisualRunResultItem[];
  /** Affected selection details for zero-run and scoped summaries. */
  affected?: AffectedVisualSummary;
  captureProfile?: VisualCaptureProfile;
};

/**
 * Distinct story ids from the last run that Accept current run may approve:
 * passed or within tolerance only (not mismatches).
 */
export function acceptableStoryIdsFromLastRun(
  lastRun: VisualLastRunSummary | null,
): string[] {
  const grouped = new Map<string, VisualRunResultItem[]>();
  for (const result of lastRun?.results ?? []) {
    grouped.set(result.storyId, [
      ...(grouped.get(result.storyId) ?? []),
      result,
    ]);
  }
  return [...grouped]
    .filter(([, results]) =>
      results.every((result) => {
        const outcome = classifyVisualRunResult(result);
        return (
          result.policyStatus !== "warning" &&
          (outcome === "passed" || outcome === "changed-within-tolerance")
        );
      }),
    )
    .map(([storyId]) => storyId);
}

/**
 * Distinct story ids from the last run that Unaccept current run may reject:
 * pixel mismatches only.
 */
export function rejectableStoryIdsFromLastRun(
  lastRun: VisualLastRunSummary | null,
): string[] {
  const ids = new Set<string>();
  for (const result of lastRun?.results ?? []) {
    if (classifyVisualRunResult(result) === "mismatch") {
      ids.add(result.storyId);
    }
  }
  return [...ids];
}

/** Union of Accept/Unaccept current-run targets (passes + mismatches). */
export function reviewableStoryIdsFromLastRun(
  lastRun: VisualLastRunSummary | null,
): string[] {
  return [
    ...new Set([
      ...acceptableStoryIdsFromLastRun(lastRun),
      ...rejectableStoryIdsFromLastRun(lastRun),
    ]),
  ];
}

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);

type ProgressListener = (progress: VisualRunProgress | null) => void;
const progressListeners = new Set<ProgressListener>();

type LastRunListener = (lastRun: VisualLastRunSummary | null) => void;
const lastRunListeners = new Set<LastRunListener>();
let latestLastRun: VisualLastRunSummary | null = null;

/** Subscribe to live run progress from any `postVisualRun` caller. */
export function subscribeVisualRunProgress(listener: ProgressListener) {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitVisualRunProgress(progress: VisualRunProgress | null) {
  for (const listener of progressListeners) {
    listener(progress);
  }
}

/** Test helper — seed run progress without opening an NDJSON stream. */
export function emitVisualRunProgressForTests(
  progress: VisualRunProgress | null,
) {
  emitVisualRunProgress(progress);
}

/** Subscribe to finished-run summaries shared across panel / Testing Module. */
export function subscribeVisualLastRun(listener: LastRunListener) {
  lastRunListeners.add(listener);
  if (latestLastRun) listener(latestLastRun);
  return () => {
    lastRunListeners.delete(listener);
  };
}

export function publishVisualLastRun(lastRun: VisualLastRunSummary | null) {
  latestLastRun = lastRun;
  persistVisualLastRun(lastRun);
  for (const listener of lastRunListeners) {
    listener(lastRun);
  }
}

/**
 * Remove stale comparison evidence after a baseline/config/eligibility
 * mutation. Review metadata is intentionally unaffected.
 */
export function invalidateVisualLastRun(storyIds?: readonly string[]) {
  const current = latestLastRun ?? loadPersistedVisualLastRun();
  if (!current) return;
  if (!storyIds?.length) {
    publishVisualLastRun(null);
    return;
  }
  const invalid = new Set(storyIds);
  const results = (current.results ?? []).filter(
    (result) => !invalid.has(result.storyId),
  );
  if (!results.length) {
    publishVisualLastRun(null);
    return;
  }
  const summary = { total: results.length, passed: 0, failed: 0, skipped: 0 };
  for (const result of results) {
    const outcome = classifyVisualRunResult(result);
    if (outcome === "skipped") summary.skipped += 1;
    else if (outcome === "passed" || outcome === "changed-within-tolerance") {
      summary.passed += 1;
    } else {
      summary.failed += 1;
    }
  }
  publishVisualLastRun({
    ...current,
    summary,
    results,
    error: summary.failed ? `${summary.failed} failed` : undefined,
  });
}

/** Vitest-style progress copy for panel / Testing Module. */
export function formatVisualProgressLabel(
  progress: VisualRunProgress | null,
): string {
  if (!progress || progress.total <= 0) return "Starting...";
  return `Testing... ${progress.completed}/${progress.total}`;
}

function statusDescription(item: VisualRunResultItem): string {
  const outcome = classifyVisualRunResult(item);
  const sc = item.sidecar;
  if (
    sc &&
    typeof sc.diffPercent === "number" &&
    typeof sc.diffPixels === "number"
  ) {
    const pct = sc.diffPercent.toFixed(4);
    const threshold =
      sc.passThresholdPercent != null
        ? ` · threshold ${sc.passThresholdPercent}%`
        : "";
    return `${pct}% changed (${sc.diffPixels} px)${threshold}`;
  }
  return (
    item.error?.split("\n")[0] ??
    (outcome === "missing-baseline"
      ? "No committed baseline screenshot"
      : outcome === "mismatch"
        ? "Screenshot differs from baseline"
        : outcome === "error"
          ? "Visual capture failed"
          : outcome === "skipped"
            ? "Excluded from visual tests"
            : outcome === "changed-within-tolerance"
              ? "Screenshot changed within tolerance"
              : "Matches baseline")
  );
}

function statusTitle(item: VisualRunResultItem): string {
  const outcome = classifyVisualRunResult(item);
  if (outcome === "skipped") return "Visual test skipped";
  if (outcome === "missing-baseline") return "Visual baseline missing";
  if (outcome === "error") return "Visual test error";
  if (outcome === "mismatch") {
    const pct = item.sidecar?.diffPercent;
    return pct != null
      ? `Visual baseline mismatch (${pct.toFixed(2)}%)`
      : "Visual baseline mismatch";
  }
  const pct = item.sidecar?.diffPercent;
  if (outcome === "changed-within-tolerance") {
    return pct != null
      ? `Visual change within tolerance (${pct.toFixed(2)}%)`
      : "Visual change within tolerance";
  }
  return pct != null
    ? `Visual test passed (${pct.toFixed(2)}%)`
    : "Visual test passed";
}

export function applyVisualStatuses(results: VisualRunResultItem[]) {
  const priority: Record<VisualComparisonOutcome, number> = {
    error: 6,
    mismatch: 5,
    "missing-baseline": 4,
    skipped: 3,
    "changed-within-tolerance": 2,
    passed: 1,
  };
  const byStory = new Map<string, VisualRunResultItem>();
  for (const item of results) {
    const current = byStory.get(item.storyId);
    if (
      !current ||
      priority[classifyVisualRunResult(item)] >
        priority[classifyVisualRunResult(current)]
    ) {
      byStory.set(item.storyId, item);
    }
  }
  const aggregated = [...byStory.values()];
  const storyIds = aggregated.map((item) => item.storyId);
  if (storyIds.length) {
    statusStore.unset(storyIds);
  } else {
    statusStore.unset();
  }
  statusStore.set(
    aggregated.map((item) => {
      const outcome = classifyVisualRunResult(item);
      return {
        storyId: item.storyId,
        typeId: STATUS_TYPE_ID_VISUAL,
        value:
          outcome === "mismatch"
            ? ("status-value:warning" as const)
            : outcome === "error"
              ? ("status-value:error" as const)
              : outcome === "skipped" || outcome === "missing-baseline"
                ? ("status-value:unknown" as const)
                : ("status-value:success" as const),
        title: statusTitle(item),
        description: statusDescription(item),
        sidebarContextMenu: outcome === "mismatch" || outcome === "error",
      };
    }),
  );
}

/**
 * Apply Playwright results, then clear any pending statuses for requested
 * stories that never ran (e.g. `skip-visual`).
 */
export function applyVisualRunResults(
  requestedStoryIds: string[] | undefined,
  results: VisualRunResultItem[],
) {
  applyVisualStatuses(results);
  if (!requestedStoryIds?.length) return;
  const resultIds = new Set(results.map((item) => item.storyId));
  const orphans = requestedStoryIds.filter((id) => !resultIds.has(id));
  if (orphans.length) statusStore.unset(orphans);
}

/** Stories Playwright will actually exercise (excludes `skip-visual`). */
export function visualRunnableStoryIds(api: API, storyIds: string[]): string[] {
  return storyIds.filter((storyId) => {
    const entry = api.resolveStory(storyId);
    if (!entry || entry.type !== "story") return true;
    return !(entry.tags ?? []).includes("skip-visual");
  });
}

/** Mark stories as pending while a scoped visual run is starting. */
export function applyPendingVisualStatuses(storyIds: string[]) {
  if (!storyIds.length) return;
  statusStore.unset(storyIds);
  statusStore.set(
    storyIds.map((storyId) => ({
      storyId,
      typeId: STATUS_TYPE_ID_VISUAL,
      value: "status-value:pending" as const,
      title: "Visual test pending",
      description: "Waiting for visual compare",
      sidebarContextMenu: false,
    })),
  );
}

export function clearVisualStatuses() {
  statusStore.unset();
}

/** Build a status item from a panel live Diff result. */
export function visualResultFromLiveDiff(input: {
  storyId: string;
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  passThresholdPercent: number;
  passed: boolean;
}): VisualRunResultItem {
  const {
    storyId,
    diffPercent,
    diffPixels,
    totalPixels,
    passThresholdPercent,
    passed,
  } = input;
  return {
    storyId,
    status: passed ? "passed" : "failed",
    title: storyId,
    sidecar: {
      version: 1,
      storyId,
      snapshotRel: "",
      status: passed ? "passed" : "failed",
      generatedAt: new Date().toISOString(),
      tool: "playwright",
      diffPercent,
      diffPixels,
      totalPixels,
      passThresholdPercent,
      passed,
    },
  };
}

/**
 * Authoritative live selected-browser comparison for one exact story. Both the panel's
 * Story action and the story-level Testing Module route through this helper.
 */
export async function compareExactStory(
  api: API,
  storyId: string,
  options?: {
    baselineUrl?: string;
    visualCaptureUntil?: string;
    visualCaptureCallId?: string;
    mode?: string;
    browser?: VisualDeltaBrowser;
    fresh?: boolean;
    onProgress?: (progress: { label: string }) => void;
    onLog?: (line: string) => void;
    signal?: AbortSignal;
  },
): Promise<VisualRunResultItem> {
  const entry = api.getData(storyId);
  if (!entry || entry.type !== "story") {
    throw new Error(`Story not found: ${storyId}`);
  }
  const params =
    "parameters" in entry
      ? (
          entry.parameters as {
            visualDelta?: VisualDeltaParams;
          }
        ).visualDelta
      : undefined;
  const config = await fetchVisualConfig();
  const browser = options?.browser ?? "chromium";
  const environment = { browser, platform: config.runtimePlatform };
  const imageInput = Array.isArray(params?.images)
    ? params.images.find((candidate) => {
        const source =
          typeof candidate === "string" ? candidate : candidate?.src;
        return options?.baselineUrl
          ? source?.split("?")[0] === options.baselineUrl.split("?")[0]
          : parseVisualBaselineEnvironment(source ?? "")?.browser === browser &&
              parseVisualBaselineEnvironment(source ?? "")?.platform ===
                config.runtimePlatform;
      })
    : params?.images;
  const image =
    imageInput && typeof imageInput === "object" ? imageInput : undefined;
  const baselineUrl =
    options?.baselineUrl ??
    (typeof imageInput === "string" ? imageInput : image?.src) ??
    baselineUrlForStoryRef(
      {
        id: storyId,
        importPath: "importPath" in entry ? entry.importPath : undefined,
        tags: entry.tags,
      },
      { allowSkipVisual: true, environment },
    );
  if (!baselineUrl) {
    throw new Error(`No baseline screenshot for ${storyId}`);
  }
  const interactionEnvironment = params?.interactions?.find(
    (interaction) =>
      interaction.src.split("?")[0] === baselineUrl.split("?")[0],
  )?.environment;
  const declaredEnvironment =
    image?.environment ?? interactionEnvironment ?? params?.environment;
  const declaredTarget = declaredEnvironment
    ? { browser: declaredEnvironment.browser }
    : undefined;
  const defaults = config.projectDefaults;
  const modeGlobals =
    options?.mode && params?.modes?.[options.mode]?.globals
      ? params.modes[options.mode]!.globals
      : undefined;
  const compared = await postBrowserStoryCompare(
    {
      storyId,
      story: {
        id: storyId,
        title:
          "title" in entry && typeof entry.title === "string"
            ? entry.title
            : undefined,
        name:
          "name" in entry && typeof entry.name === "string"
            ? entry.name
            : undefined,
        importPath:
          "importPath" in entry && typeof entry.importPath === "string"
            ? entry.importPath
            : undefined,
        tags: entry.tags,
      },
      baselineUrl,
      align: params?.align ?? image?.align ?? "viewport",
      visualCaptureUntil: options?.visualCaptureUntil,
      visualCaptureCallId: options?.visualCaptureCallId,
      mode: options?.mode,
      globals: modeGlobals ? buildArgsParam({}, modeGlobals) : undefined,
      viewport: image?.viewport ?? VISUAL_VIEWPORT,
      deviceScaleFactor: image?.deviceScaleFactor ?? VISUAL_DEVICE_SCALE_FACTOR,
      delay: params?.delay ?? defaults.delay,
      ignoreSelectors: resolveIgnoreSelectors(params?.ignoreSelectors),
      cropToViewport: params?.cropToViewport ?? defaults.cropToViewport,
      passThresholdPercent:
        params?.passThresholdPercent ?? defaults.passThresholdPercent,
      diffThreshold: params?.diffThreshold ?? defaults.diffThreshold,
      includeAntiAliasing:
        params?.diffIncludeAntiAliasing ?? defaults.diffIncludeAntiAliasing,
      browser,
      fresh: options?.fresh,
      target: declaredTarget,
    },
    {
      signal: options?.signal,
      onProgress: (progress) => options?.onProgress?.(progress),
      onLog: (line) => options?.onLog?.(line),
    },
  );
  return {
    storyId,
    title: storyId,
    status: compared.sidecar.status,
    sidecar: compared.sidecar,
    outcome: compared.sidecar.outcome,
    policyStatus: compared.sidecar.policyStatus,
    target: compared.target,
    captureProfile: compared.captureProfile,
    environment: compared.environment,
    ...(compared.review ? { review: compared.review } : {}),
    ...(compared.sidecar.error ? { error: compared.sidecar.error } : {}),
  };
}

/** All leaf story ids for the component that owns `storyId`. */
export function componentStoryIdsFor(api: API, storyId: string): string[] {
  const entry = api.resolveStory(storyId);
  if (!entry || entry.type !== "story" || !entry.parent) return [storyId];
  const siblings = api.findAllLeafStoryIds(entry.parent);
  return siblings.length ? siblings : [storyId];
}

export function storyIdsForScope(
  api: API,
  scope: VisualRunScope,
  storyId?: string,
): string[] | undefined {
  if (scope === "all" || scope === "affected" || !storyId) return undefined;
  if (scope === "story") return [storyId];
  return componentStoryIdsFor(api, storyId);
}

function notifyProgress(
  progress: VisualRunProgress,
  onProgress?: (progress: VisualRunProgress) => void,
) {
  emitVisualRunProgress(progress);
  onProgress?.(progress);
}

/** Bumped per stream so an aborted HMR fetch does not clear a newer reconnect. */
let ndjsonStreamGeneration = 0;

/** Shared abort for in-flight run / reconnect / action-scope fetches. */
let visualFetchAbort: AbortController | null = null;

function armVisualFetchAbort(): AbortSignal {
  visualFetchAbort?.abort();
  visualFetchAbort = new AbortController();
  return visualFetchAbort.signal;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function cancelledVisualRunResponse(): VisualRunResponse {
  return {
    ok: true,
    idle: true,
    cancelled: true,
    exitCode: 0,
    rebuild: false,
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    results: [],
    logTail: "",
  };
}

async function readNdjsonRun(
  response: Response,
  onProgress?: (progress: VisualRunProgress) => void,
  signal?: AbortSignal,
): Promise<VisualRunResponse> {
  const body = response.body;
  if (!body) {
    throw new Error("Visual run response had no body");
  }

  const generation = ++ndjsonStreamGeneration;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: VisualRunResponse | null = null;
  let streamError: string | undefined;
  let idle = false;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
      return cancelledVisualRunResponse();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      if (signal?.aborted) return cancelledVisualRunResponse();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: VisualRunStreamEvent;
        try {
          event = JSON.parse(trimmed) as VisualRunStreamEvent;
        } catch {
          continue;
        }

        if (event.type === "idle") {
          idle = true;
          continue;
        }

        if (event.type === "start") {
          notifyProgress(
            {
              completed: 0,
              total: event.total,
              passed: 0,
              failed: 0,
              affected: event.affected,
            },
            onProgress,
          );
          continue;
        }

        if (event.type === "log") {
          const line = event.line?.trim();
          if (line) emitVisualRunLog(line);
          continue;
        }

        if (event.type === "progress") {
          notifyProgress(
            {
              completed: event.completed,
              total: event.total,
              passed: event.passed,
              failed: event.failed,
              warnings: event.warnings,
              storyId: event.storyId,
              status: event.status,
              target: event.target,
              captureProfile: event.captureProfile,
              environment: event.environment,
            },
            onProgress,
          );
          continue;
        }

        if (event.type === "error") {
          streamError = event.error;
          continue;
        }

        if (event.type === "done") {
          const { type: _type, ...rest } = event;
          void _type;
          final = rest;
        }
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      return cancelledVisualRunResponse();
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (generation === ndjsonStreamGeneration) {
      emitVisualRunProgress(null);
    }
  }

  if (signal?.aborted) return cancelledVisualRunResponse();

  if (idle && !final) {
    return {
      ok: true,
      idle: true,
      exitCode: 0,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    };
  }

  if (final) return final;

  return {
    ok: false,
    crashed: true,
    error: streamError ?? "Visual run ended without a result",
    exitCode: 1,
    rebuild: false,
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    results: [],
    logTail: "",
  };
}

export type VisualRunHubStatus = {
  phase: "idle" | "running" | "done";
  total: number;
  completed: number;
  passed: number;
  failed: number;
  /** True while middleware still owns a compare or baseline-write child. */
  childActive?: boolean;
};

/** Lightweight phase check used before opening a reconnect stream. */
export async function fetchVisualRunStatus(): Promise<VisualRunHubStatus> {
  try {
    const response = await fetch(VISUAL_DELTA_RUN_STATUS_PATH);
    if (!response.ok) {
      return {
        phase: "idle",
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        childActive: false,
      };
    }
    return (await response.json()) as VisualRunHubStatus;
  } catch {
    return {
      phase: "idle",
      total: 0,
      completed: 0,
      passed: 0,
      failed: 0,
      childActive: false,
    };
  }
}

/**
 * Reattach to an in-flight or recently finished visual run after manager HMR.
 * Returns `idle` when there is nothing to recover.
 */
export async function reconnectVisualRun(options?: {
  onProgress?: (progress: VisualRunProgress) => void;
}): Promise<VisualRunResponse> {
  const signal = armVisualFetchAbort();
  try {
    const response = await fetch(VISUAL_DELTA_RUN_EVENTS_PATH, { signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return {
        ok: false,
        crashed: true,
        idle: true,
        error: `Reconnect failed (${response.status})`,
        exitCode: 1,
        rebuild: false,
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        results: [],
        logTail: "",
      };
    }
    if (contentType.includes("ndjson") || contentType.includes("x-ndjson")) {
      return readNdjsonRun(response, options?.onProgress, signal);
    }
    return {
      ok: true,
      idle: true,
      exitCode: 0,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    };
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return cancelledVisualRunResponse();
    }
    throw error;
  }
}

export async function postVisualRun(
  body: {
    storyIds?: string[];
    rebuild?: boolean;
    selection?: VisualRunSelectionMode;
    browsers?: VisualDeltaBrowser[];
    failureMode?: "warn" | "strict";
    fresh?: boolean;
  },
  options?: {
    onProgress?: (progress: VisualRunProgress) => void;
  },
): Promise<VisualRunResponse> {
  const signal = armVisualFetchAbort();
  try {
    const response = await fetch(VISUAL_DELTA_RUN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("ndjson") || contentType.includes("x-ndjson")) {
      return readNdjsonRun(response, options?.onProgress, signal);
    }

    const data = (await response.json()) as VisualRunResponse;
    if (!response.ok && data == null) {
      throw new Error(`Visual run failed (${response.status})`);
    }
    return data;
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return cancelledVisualRunResponse();
    }
    throw error;
  }
}

export async function fetchAffectedVisualPlan(): Promise<
  AffectedVisualSummary & { enabled: boolean }
> {
  const response = await fetch(VISUAL_DELTA_AFFECTED_PLAN_PATH);
  if (!response.ok) {
    throw new Error(`Affected plan request failed (${response.status})`);
  }
  return (await response.json()) as AffectedVisualSummary & {
    enabled: boolean;
  };
}

/** Resolve and freeze global visible ids after any affected safety rebuild. */
export async function postVisualActionScope(
  body: {
    visibleStoryIds: string[];
    affectedOnly: boolean;
  },
  options?: {
    onProgress?: (progress: VisualActionScopeProgress) => void;
  },
): Promise<VisualActionScopeResponse> {
  const signal = armVisualFetchAbort();
  try {
    const response = await fetch(VISUAL_DELTA_ACTION_SCOPE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("ndjson") || contentType.includes("x-ndjson")) {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Visual action scope response had no body");
      }
      const onAbort = () => {
        void reader.cancel().catch(() => undefined);
      };
      if (signal.aborted) {
        onAbort();
        throw new DOMException("Aborted", "AbortError");
      }
      signal.addEventListener("abort", onAbort, { once: true });
      const decoder = new TextDecoder();
      let buffer = "";
      let final: VisualActionScopeResponse | null = null;
      let streamError: string | undefined;

      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event: VisualActionScopeStreamEvent;
        try {
          event = JSON.parse(trimmed) as VisualActionScopeStreamEvent;
        } catch {
          return;
        }
        if (event.type === "progress") {
          const { type: _type, ...progress } = event;
          void _type;
          options?.onProgress?.(progress);
        } else if (event.type === "error") {
          streamError = event.error;
        } else if (event.type === "done") {
          const { type: _type, ...result } = event;
          void _type;
          final = result;
        }
      };

      try {
        while (true) {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        consumeLine(buffer);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }

      if (final) return final;
      throw new Error(
        streamError ?? "Visual action scope ended without a result",
      );
    }

    const data = (await response.json()) as
      | VisualActionScopeResponse
      | { ok?: false; error?: string };
    if (!response.ok || !data.ok) {
      throw new Error(
        "error" in data && data.error
          ? data.error
          : `Visual action scope request failed (${response.status})`,
      );
    }
    return data;
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  }
}

/**
 * Abort in-flight visual work and clear all manager presentation buses.
 * Safe when no child is alive — still clears orphan run/create/status UI.
 */
export async function abortVisualWork(): Promise<{
  ok: boolean;
  cancelled: boolean;
}> {
  visualFetchAbort?.abort();
  visualFetchAbort = null;
  ndjsonStreamGeneration += 1;
  emitVisualRunProgress(null);
  emitVisualCreateProgress(null);
  clearPersistedVisualStatusJob();
  try {
    const response = await fetch(VISUAL_DELTA_CANCEL_PATH, { method: "POST" });
    if (!response.ok) {
      return { ok: false, cancelled: false };
    }
    const data = (await response.json()) as {
      ok?: boolean;
      cancelled?: boolean;
    };
    return { ok: Boolean(data.ok), cancelled: Boolean(data.cancelled) };
  } catch {
    return { ok: false, cancelled: false };
  }
}

/** @deprecated Prefer `abortVisualWork` — kept for call-site compatibility. */
export async function cancelVisualRun() {
  await abortVisualWork();
}

export type VisualReviewResponse = {
  ok: boolean;
  storyId: string;
  status: VisualReviewStatus;
  error?: string;
  changes?: VisualDeltaChangeSetMutation;
};

/** Read resolved host options + onboarding status. */
export async function fetchVisualConfig(): Promise<VisualDeltaResolvedConfig> {
  const response = await fetch(VISUAL_DELTA_CONFIG_PATH);
  if (!response.ok) {
    throw new Error(`Config request failed (${response.status})`);
  }
  return (await response.json()) as VisualDeltaResolvedConfig;
}

export type VisualInitResponse = {
  ok: true;
  written: string[];
  skipped: string[];
  scriptsUpdated: string[];
  suiteReady: boolean;
  playwrightConfigReady: boolean;
  snapshotDir: string;
  onboarding: VisualDeltaResolvedConfig["onboarding"];
  changes?: VisualDeltaChangeSetMutation;
};

/** Scaffold portable suite / Playwright config / snapshot dir via middleware. */
export async function postVisualInit(): Promise<VisualInitResponse> {
  const response = await fetch(VISUAL_DELTA_INIT_PATH, { method: "POST" });
  const data = (await response.json()) as VisualInitResponse & {
    error?: string;
  };
  announceVisualDeltaChanges(data.changes);
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Init failed (${response.status})`);
  }
  return data;
}

/** Persist visual review tags on the story CSF via middleware. */
export async function postVisualReviewStatus(body: {
  storyId: string;
  status: VisualReviewStatus;
}): Promise<VisualReviewResponse> {
  const response = await fetch(VISUAL_DELTA_REVIEW_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as VisualReviewResponse;
  announceVisualDeltaChanges(data.changes);
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `Review status update failed (${response.status})`,
    );
  }
  return data;
}

/** Persist a deliberate batch of review tags in one middleware/HMR cycle. */
export async function postVisualReviewStatuses(
  updates: Array<{ storyId: string; status: VisualReviewStatus }>,
): Promise<{ updated: number; errors: string[] }> {
  if (!updates.length) return { updated: 0, errors: [] };
  const response = await fetch(VISUAL_DELTA_REVIEW_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    updated?: number;
    errors?: string[];
    error?: string;
    changes?: VisualDeltaChangeSetMutation;
  };
  if (!response.ok && data.updated == null) {
    throw new Error(
      data.error || `Review status update failed (${response.status})`,
    );
  }
  announceVisualDeltaChanges(data.changes);
  return {
    updated: data.updated ?? 0,
    errors: data.errors ?? [],
  };
}

/**
 * Stamp CSF review tags from visual run outcomes:
 * passed → ready (unless already approved), mismatch → failed.
 * Skips skipped / timedOut and failures with no committed baseline
 * (those must not become `visual-failed`).
 * Uses one batched middleware call so HMR lands after the write finishes.
 */
export async function postVisualReviewStatusesFromResults(
  results: VisualRunResultItem[],
  options?: ReviewUpdatesFromRunResultsOptions,
): Promise<{
  updated: number;
  errors: string[];
  skippedMissingBaseline: number;
}> {
  const skippedMissingBaseline = results.filter(
    (item) => item.status === "failed" && isMissingBaselineFailure(item),
  ).length;
  const updates = reviewUpdatesFromRunResults(results, options);
  if (!updates.length) {
    return { updated: 0, errors: [], skippedMissingBaseline };
  }

  persistVisualStatusJob({ updates });
  try {
    const data = await postVisualReviewStatuses(updates);
    clearPersistedVisualStatusJob();
    const rawErrors = data.errors;
    const softSkipped = rawErrors.filter((error) =>
      isNoBaselineFailedReviewError(error),
    ).length;
    const errors = rawErrors.filter(
      (error) => !isNoBaselineFailedReviewError(error),
    );
    return {
      updated: data.updated,
      errors,
      skippedMissingBaseline: skippedMissingBaseline + softSkipped,
    };
  } catch (error) {
    // Leave the job in sessionStorage so remount can retry.
    throw error;
  }
}

/** Resume a batched review-status job left behind by manager HMR. */
export async function resumePersistedVisualStatusJob(): Promise<{
  updated: number;
  errors: string[];
} | null> {
  const job = loadPersistedVisualStatusJob();
  if (!job?.updates.length) return null;
  persistVisualStatusJob(job);
  try {
    const response = await fetch(VISUAL_DELTA_REVIEW_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: job.updates }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      updated?: number;
      errors?: string[];
      error?: string;
      changes?: VisualDeltaChangeSetMutation;
    };
    announceVisualDeltaChanges(data.changes);
    if (!response.ok && data.updated == null) {
      throw new Error(
        data.error || `Review status update failed (${response.status})`,
      );
    }
    clearPersistedVisualStatusJob();
    const rawErrors = data.errors ?? [];
    return {
      updated: data.updated ?? 0,
      errors: rawErrors.filter(
        (error) => !isNoBaselineFailedReviewError(error),
      ),
    };
  } catch (error) {
    throw error;
  }
}

export type VisualSkipVisualResponse = {
  ok: boolean;
  storyId: string;
  skip: boolean;
  error?: string;
  changes?: VisualDeltaChangeSetMutation;
};

/** Persist add/remove of `skip-visual` on the story CSF via middleware. */
export async function postVisualSkipVisual(body: {
  storyId: string;
  skip: boolean;
}): Promise<VisualSkipVisualResponse> {
  const response = await fetch(VISUAL_DELTA_SKIP_VISUAL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as VisualSkipVisualResponse;
  announceVisualDeltaChanges(data.changes);
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `skip-visual update failed (${response.status})`,
    );
  }
  return data;
}

/** Persist allow-listed `parameters.visualDelta` overrides on one exact story. */
export async function putVisualStoryConfig(
  update: VisualDeltaStoryConfigUpdate,
): Promise<VisualDeltaStoryConfigUpdateResponse> {
  const response = await fetch(VISUAL_DELTA_STORY_CONFIG_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  const data = (await response.json()) as
    | (VisualDeltaStoryConfigUpdateResponse & {
        changes?: VisualDeltaChangeSetMutation;
      })
    | { error?: string; changes?: VisualDeltaChangeSetMutation };
  announceVisualDeltaChanges(data.changes);
  if (!response.ok || !("ok" in data) || data.ok !== true) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : `Story configuration update failed (${response.status})`,
    );
  }
  return data;
}

export type VisualBaselineJobKind =
  | "create"
  | "update"
  | "interaction"
  | "rebuild";

export type VisualCreateProgress = {
  running: boolean;
  label: string;
  /** Which baseline write / rebuild endpoint produced this progress. */
  kind: VisualBaselineJobKind;
  /** Frozen story scope for this write. Empty only for global rebuild work. */
  storyIds: string[];
  error?: string;
  logTail?: string;
  /** 1-based index of the current component target (multi-target writes). */
  completed?: number;
  /** Total component targets in this write job. */
  total?: number;
  target?: VisualBaselineTarget;
  captureProfile?: VisualCaptureProfile;
};

export function visualCreateProgressAppliesToStory(
  progress: VisualCreateProgress,
  storyId: string | undefined,
): boolean {
  return (
    progress.kind === "rebuild" ||
    Boolean(storyId && progress.storyIds.includes(storyId))
  );
}

type CreateProgressListener = (progress: VisualCreateProgress | null) => void;
const createProgressListeners = new Set<CreateProgressListener>();
let latestCreateProgress: VisualCreateProgress | null =
  typeof sessionStorage !== "undefined"
    ? (() => {
        try {
          const raw = sessionStorage.getItem(CREATE_PROGRESS_STORAGE_KEY);
          if (!raw) return null;
          return JSON.parse(raw) as VisualCreateProgress;
        } catch {
          return null;
        }
      })()
    : null;

/** Subscribe to create/update baseline progress from panel or sidebar. */
export function subscribeVisualCreateProgress(
  listener: CreateProgressListener,
) {
  createProgressListeners.add(listener);
  if (latestCreateProgress) listener(latestCreateProgress);
  return () => {
    createProgressListeners.delete(listener);
  };
}

function persistCreateProgress(progress: VisualCreateProgress | null) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!progress?.running) {
      sessionStorage.removeItem(CREATE_PROGRESS_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      CREATE_PROGRESS_STORAGE_KEY,
      JSON.stringify(progress),
    );
  } catch {
    /* ignore */
  }
}

function emitVisualCreateProgress(progress: VisualCreateProgress | null) {
  latestCreateProgress = progress;
  persistCreateProgress(progress);
  for (const listener of createProgressListeners) {
    listener(progress);
  }
}

export function loadPersistedCreateProgress(): VisualCreateProgress | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(CREATE_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VisualCreateProgress;
  } catch {
    return null;
  }
}

/** Drop orphan baseline-write presentation when no writer is active. */
export function clearStaleVisualCreateProgress() {
  if (latestCreateProgress?.running || latestCreateProgress) {
    emitVisualCreateProgress(null);
    return;
  }
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(CREATE_PROGRESS_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Test helper — inspect create progress without mutating. */
/** Current baseline-write presentation, if any. */
export function peekVisualCreateProgress(): VisualCreateProgress | null {
  return latestCreateProgress;
}

/** @deprecated Prefer `peekVisualCreateProgress`. */
export function peekVisualCreateProgressForTests(): VisualCreateProgress | null {
  return peekVisualCreateProgress();
}

/** Test helper — seed create/update baseline progress. */
export function emitVisualCreateProgressForTests(
  progress: VisualCreateProgress | null,
) {
  emitVisualCreateProgress(progress);
}

export type VisualCreateResponse = {
  ok: boolean;
  log: string;
  changes?: VisualDeltaChangeSetMutation;
};

async function postVisualBaselineWrite(
  kind: Extract<VisualBaselineJobKind, "create" | "update">,
  body: {
    storyId?: string;
    storyIds?: string[];
    rebuild?: boolean;
    browser?: VisualDeltaBrowser;
  },
  options?: {
    /** Override the in-flight status label (e.g. `Creating… 1/3`). */
    runningLabel?: string;
    /** Override the success label when the job finishes cleanly. */
    successLabel?: string;
    /** 1-based index for multi-target Testing Module progress. */
    completed?: number;
    /** Total targets for multi-target Testing Module progress. */
    total?: number;
  },
): Promise<VisualCreateResponse> {
  const path =
    kind === "create" ? VISUAL_DELTA_CREATE_PATH : VISUAL_DELTA_UPDATE_PATH;
  const runningLabel =
    options?.runningLabel ?? (kind === "create" ? "Creating…" : "Updating…");
  const failedLabel = kind === "create" ? "Create failed" : "Update failed";
  const failVerb =
    kind === "create" ? "Create baselines failed" : "Update baselines failed";
  const exitVerb = kind === "create" ? "Baseline create" : "Baseline update";
  const storyIds = [
    ...new Set(
      (body.storyIds ?? (body.storyId ? [body.storyId] : []))
        .map((storyId) => storyId.trim())
        .filter(Boolean),
    ),
  ];
  const fraction = {
    completed: options?.completed,
    total: options?.total,
  };
  const provenance = {
    target: { browser: body.browser ?? "chromium" } as VisualBaselineTarget,
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
  };

  emitVisualCreateProgress({
    running: true,
    label: runningLabel,
    kind,
    storyIds,
    logTail: "",
    ...fraction,
    ...provenance,
  });
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let log = "";
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        log += decoder.decode(value, { stream: true });
        emitVisualCreateProgress({
          running: true,
          label: runningLabel,
          kind,
          storyIds,
          logTail: log.slice(-12_000),
          ...fraction,
          ...provenance,
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();
    const changes = parseVisualDeltaChangeMarker(log);
    announceVisualDeltaChanges(changes);

    if (!response.ok) {
      const error = log || `${failVerb} (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        storyIds,
        error,
        logTail: log || undefined,
        ...provenance,
      });
      throw new Error(error);
    }
    const exitMatch = log.match(/\[exit (\d+)\]/);
    if (exitMatch && exitMatch[1] !== "0") {
      const detail = /Address already in use|was not able to start/i.test(log)
        ? "Playwright static server failed to start (visual port busy or stale)."
        : /No recipe for/i.test(log)
          ? log.match(/No recipe for[^\n]+/)?.[0]
          : /No tests found/i.test(log)
            ? "No Playwright visual tests matched (stale skip-visual index or empty scope)."
            : /Create failed — no baseline PNG/i.test(log)
              ? log.match(/Create failed — no baseline PNG[^\n]*/)?.[0]
              : undefined;
      const error = detail ?? `${exitVerb} exited with code ${exitMatch[1]}`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        storyIds,
        error,
        logTail: log || undefined,
        ...provenance,
      });
      throw new Error(error);
    }
    // Older CLIs swallowed Playwright "No tests found" and still exited 0.
    if (
      kind === "create" &&
      (/No tests found/i.test(log) ||
        /Create failed — no baseline PNG/i.test(log))
    ) {
      const error =
        /Create failed — no baseline PNG[^\n]*/i.exec(log)?.[0] ??
        "No Playwright visual tests matched (stale skip-visual index or empty scope).";
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        storyIds,
        error,
        logTail: log || undefined,
        ...provenance,
      });
      throw new Error(error);
    }

    let label: string;
    if (options?.successLabel) {
      label = options.successLabel;
    } else if (kind === "create") {
      const patchMatch = log.match(
        /Story visualDelta patch:\s*(\d+)\s*updated(?:,\s*(\d+)\s*already wired)?/i,
      );
      const patchedCount = patchMatch ? Number(patchMatch[1]) : 0;
      const alreadyWiredCount = patchMatch?.[2] ? Number(patchMatch[2]) : 0;
      const wiredCount = patchedCount + alreadyWiredCount;
      label =
        wiredCount > 0
          ? `Created (${wiredCount} stor${wiredCount === 1 ? "y" : "ies"} wired)`
          : /skip-visual/i.test(body.storyId ?? "") ||
              body.storyId?.endsWith("--closed")
            ? "Created — open a visual story (not skip-visual) to review"
            : "Created";
    } else {
      label = "Updated";
    }

    emitVisualCreateProgress({
      running: false,
      label,
      kind,
      storyIds,
      logTail: log || undefined,
      ...fraction,
      ...provenance,
    });
    invalidateVisualLastRun(
      body.storyIds ?? (body.storyId ? [body.storyId] : undefined),
    );
    return { ok: true, log, ...(changes ? { changes } : {}) };
  } catch (error) {
    if (
      latestCreateProgress?.running === false &&
      latestCreateProgress.error &&
      latestCreateProgress.kind === kind
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : failVerb;
    emitVisualCreateProgress({
      running: false,
      label: failedLabel,
      kind,
      storyIds,
      error: message,
      ...fraction,
      ...provenance,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Create a missing Playwright baseline for exactly one story.
 */
export async function postVisualCreateBaseline(body: {
  storyId: string;
  rebuild?: boolean;
  browser?: VisualDeltaBrowser;
}): Promise<VisualCreateResponse> {
  return postVisualBaselineWrite("create", body);
}

/**
 * Create missing baselines for exactly the supplied stories in one invocation.
 */
export async function postVisualCreateBaselinesForStoryIds(
  _api: API,
  storyIds: string[],
  options?: { rebuild?: boolean },
): Promise<void> {
  const targets = [...new Set(storyIds.map((id) => id.trim()).filter(Boolean))];
  if (!targets.length) {
    emitVisualCreateProgress({
      running: false,
      label: "No stories",
      kind: "create",
      storyIds: [],
      error: "No stories visible in the sidebar",
    });
    throw new Error("No stories visible in the sidebar");
  }
  const total = targets.length;
  await postVisualBaselineWrite(
    "create",
    { storyIds: targets, rebuild: options?.rebuild },
    {
      runningLabel: total > 1 ? `Creating… 0/${total}` : "Creating…",
      completed: total,
      total,
      successLabel:
        total > 1 ? `Created (${total} stories selected)` : undefined,
    },
  );
}

/**
 * Overwrite baselines for exactly the supplied stories in one invocation.
 */
export async function postVisualUpdateBaselinesForStoryIds(
  _api: API,
  storyIds: string[],
  options?: { rebuild?: boolean },
): Promise<void> {
  const targets = [...new Set(storyIds.map((id) => id.trim()).filter(Boolean))];
  if (!targets.length) {
    emitVisualCreateProgress({
      running: false,
      label: "No stories",
      kind: "update",
      storyIds: [],
      error: "No stories visible in the sidebar",
    });
    throw new Error("No stories visible in the sidebar");
  }
  const total = targets.length;
  await postVisualBaselineWrite(
    "update",
    { storyIds: targets, rebuild: options?.rebuild },
    {
      runningLabel: total > 1 ? `Updating… 0/${total}` : "Updating…",
      completed: total,
      total,
      successLabel:
        total > 1 ? `Updated (${total} stories selected)` : undefined,
    },
  );
}

/**
 * Overwrite the Playwright baseline for exactly one story.
 */
export async function postVisualUpdateBaseline(body: {
  storyId: string;
  rebuild?: boolean;
  browser?: VisualDeltaBrowser;
}): Promise<VisualCreateResponse> {
  return postVisualBaselineWrite("update", body);
}

/** Remove one exact screenshot from story CSF and the local snapshot folder. */
export async function postVisualDeleteBaseline(body: {
  storyId: string;
  baselineUrl: string;
  interactionId?: string;
}): Promise<{
  ok: true;
  storyId: string;
  baselineUrl: string;
  sourceUpdated: boolean;
  deletedFiles: string[];
  changes?: VisualDeltaChangeSetMutation;
}> {
  const response = await fetch(VISUAL_DELTA_DELETE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    storyId?: string;
    baselineUrl?: string;
    sourceUpdated?: boolean;
    deletedFiles?: string[];
    error?: string;
    changes?: VisualDeltaChangeSetMutation;
  };
  announceVisualDeltaChanges(data.changes);
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `Delete screenshot failed (${response.status})`,
    );
  }
  return {
    ok: true,
    storyId: data.storyId ?? body.storyId,
    baselineUrl: data.baselineUrl ?? body.baselineUrl,
    sourceUpdated: data.sourceUpdated ?? false,
    deletedFiles: data.deletedFiles ?? [],
    ...(data.changes ? { changes: data.changes } : {}),
  };
}

/**
 * Force `pnpm build-storybook` via middleware (no Playwright capture).
 * Streams logs into the shared create/update progress channel.
 */
export async function postVisualRebuildStatic(): Promise<VisualCreateResponse> {
  const kind = "rebuild" as const;
  const storyIds: string[] = [];
  const runningLabel = "Rebuilding static…";
  const failedLabel = "Rebuild failed";
  emitVisualCreateProgress({
    running: true,
    label: runningLabel,
    kind,
    storyIds,
    logTail: "",
  });
  try {
    const response = await fetch(VISUAL_DELTA_REBUILD_STATIC_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    let log = "";
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        log += decoder.decode(value, { stream: true });
        emitVisualCreateProgress({
          running: true,
          label: runningLabel,
          kind,
          storyIds,
          logTail: log.slice(-12_000),
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();
    const changes = parseVisualDeltaChangeMarker(log);
    announceVisualDeltaChanges(changes);

    if (!response.ok) {
      const error = log || `${failedLabel} (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        storyIds,
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }
    const exitMatch = log.match(/\[exit (\d+)\]/);
    if (exitMatch && exitMatch[1] !== "0") {
      const error = `build-storybook exited with code ${exitMatch[1]}`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        storyIds,
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }

    emitVisualCreateProgress({
      running: false,
      label: "Static rebuilt",
      kind,
      storyIds,
      logTail: log || undefined,
    });
    return { ok: true, log, ...(changes ? { changes } : {}) };
  } catch (error) {
    if (
      latestCreateProgress?.running === false &&
      latestCreateProgress.error &&
      latestCreateProgress.kind === kind
    ) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Rebuild storybook-static failed";
    emitVisualCreateProgress({
      running: false,
      label: failedLabel,
      kind,
      storyIds,
      error: message,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Create or update one mid-play interaction baseline for a named play step.
 */
export async function postVisualInteractionBaseline(body: {
  storyId: string;
  stepLabel: string;
  stepId?: string;
  /** Exact Storybook Interactions call selected for an ordinary call capture. */
  captureCallId?: string;
  overwrite?: boolean;
  browser?: VisualDeltaBrowser;
}): Promise<VisualCreateResponse> {
  const storyIds = [body.storyId];
  const provenance = {
    target: { browser: body.browser ?? "chromium" } as VisualBaselineTarget,
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
  };
  emitVisualCreateProgress({
    running: true,
    label: body.overwrite ? "Updating interaction…" : "Creating interaction…",
    kind: "interaction",
    storyIds,
    ...provenance,
    logTail: "",
  });
  try {
    const response = await fetch(VISUAL_DELTA_CREATE_INTERACTION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let log = "";
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        log += decoder.decode(value, { stream: true });
        emitVisualCreateProgress({
          running: true,
          label: body.overwrite
            ? "Updating interaction…"
            : "Creating interaction…",
          kind: "interaction",
          storyIds,
          ...provenance,
          logTail: log.slice(-12_000),
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();
    const changes = parseVisualDeltaChangeMarker(log);
    announceVisualDeltaChanges(changes);

    if (!response.ok) {
      const error = log || `Interaction baseline failed (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: "Interaction failed",
        kind: "interaction",
        storyIds,
        ...provenance,
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }
    const exitMatch = log.match(/\[exit (\d+)\]/);
    if (exitMatch && exitMatch[1] !== "0") {
      const error = `Interaction baseline exited with code ${exitMatch[1]}`;
      emitVisualCreateProgress({
        running: false,
        label: "Interaction failed",
        kind: "interaction",
        storyIds,
        ...provenance,
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }

    emitVisualCreateProgress({
      running: false,
      label: body.overwrite ? "Interaction updated" : "Interaction created",
      kind: "interaction",
      storyIds,
      ...provenance,
      logTail: log || undefined,
    });
    return { ok: true, log, ...(changes ? { changes } : {}) };
  } catch (error) {
    if (
      latestCreateProgress?.running === false &&
      latestCreateProgress.error &&
      latestCreateProgress.kind === "interaction"
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Interaction baseline failed";
    emitVisualCreateProgress({
      running: false,
      label: "Interaction failed",
      kind: "interaction",
      storyIds,
      ...provenance,
      error: message,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
