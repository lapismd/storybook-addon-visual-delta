import { experimental_getStatusStore, type API } from "storybook/manager-api";
import {
  STATUS_TYPE_ID_VISUAL,
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_CONFIG_PATH,
  VISUAL_DELTA_CREATE_INTERACTION_PATH,
  VISUAL_DELTA_CREATE_PATH,
  VISUAL_DELTA_INIT_PATH,
  VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH,
  VISUAL_DELTA_REBUILD_STATIC_PATH,
  VISUAL_DELTA_REVIEW_PATH,
  VISUAL_DELTA_RUN_EVENTS_PATH,
  VISUAL_DELTA_RUN_PATH,
  VISUAL_DELTA_RUN_STATUS_PATH,
  VISUAL_DELTA_SKIP_VISUAL_PATH,
  VISUAL_DELTA_UPDATE_PATH,
  type VisualReviewStatus,
} from "../constants.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import {
  PLAYWRIGHT_PASS_THRESHOLD_PERCENT,
  type VisualDiffSidecar,
} from "../visual-diff-sidecar.js";

export type VisualRunResultItem = {
  storyId: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  title: string;
  error?: string;
  sidecar?: VisualDiffSidecar;
  /** Set when the story failed because no committed baseline PNG exists. */
  missingBaseline?: boolean;
};

/** Middleware / patcher message when refusing visual-failed without a PNG. */
export const NO_BASELINE_FAILED_ERROR =
  "Cannot mark failed — no baseline screenshot";

export function isMissingBaselineFailure(item: VisualRunResultItem): boolean {
  if (item.missingBaseline) return true;
  const error = item.error?.toLowerCase() ?? "";
  if (!error) return false;
  return (
    error.includes("snapshot doesn't exist") ||
    error.includes("snapshot does not exist") ||
    error.includes("no baseline screenshot") ||
    error.includes(NO_BASELINE_FAILED_ERROR.toLowerCase())
  );
}

/**
 * Map run outcomes to review tags: passed → ready, failed → failed.
 * Skips skipped / timedOut, and failed stories with no baseline PNG.
 */
export function reviewUpdatesFromRunResults(
  results: VisualRunResultItem[],
): Array<{ storyId: string; status: VisualReviewStatus }> {
  return results
    .filter((item) => item.status === "passed" || item.status === "failed")
    .filter(
      (item) => !(item.status === "failed" && isMissingBaselineFailure(item)),
    )
    .map((item) => ({
      storyId: item.storyId,
      status: (item.status === "passed"
        ? "ready"
        : "failed") as VisualReviewStatus,
    }));
}

export function isNoBaselineFailedReviewError(error: string): boolean {
  return error.toLowerCase().includes("no baseline screenshot");
}

export type VisualRunResponse = {
  ok: boolean;
  exitCode: number;
  crashed?: boolean;
  error?: string;
  rebuild: boolean;
  grep?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: VisualRunResultItem[];
  logTail: string;
  /** Set when `/run-events` reports no active or recent run. */
  idle?: boolean;
};

export type VisualRunProgress = {
  completed: number;
  total: number;
  passed: number;
  failed: number;
  storyId?: string;
  status?: "passed" | "failed";
};

export type VisualRunStreamEvent =
  | { type: "idle" }
  | { type: "start"; total: number }
  | ({ type: "progress" } & VisualRunProgress)
  | { type: "log"; line: string }
  | ({ type: "done" } & VisualRunResponse)
  | { type: "error"; error: string; crashed?: boolean };

const LAST_RUN_STORAGE_KEY = "visual-delta:last-run";
const STATUS_JOB_STORAGE_KEY = "visual-delta:status-job";

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

export type VisualRunScope = "story" | "component" | "all";

export type VisualLastRunSummary = {
  finishedAt: number;
  summary: VisualRunResponse["summary"];
  error?: string;
  scope?: VisualRunScope;
  /** Trailing Playwright / middleware log for the panel status popover. */
  logTail?: string;
  /** Per-story outcomes for Update status / follow-up actions. */
  results?: VisualRunResultItem[];
};

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

/** Vitest-style progress copy for panel / Testing Module. */
export function formatVisualProgressLabel(
  progress: VisualRunProgress | null,
): string {
  if (!progress || progress.total <= 0) return "Starting...";
  return `Testing... ${progress.completed}/${progress.total}`;
}

function isVisualFailed(item: VisualRunResultItem): boolean {
  if (item.status === "skipped") return false;
  if (item.status === "timedOut") return true;
  const sc = item.sidecar;
  if (sc) {
    if (typeof sc.passed === "boolean") return !sc.passed;
    if (typeof sc.diffPercent === "number") {
      const threshold =
        sc.passThresholdPercent ?? PLAYWRIGHT_PASS_THRESHOLD_PERCENT;
      return sc.diffPercent >= threshold;
    }
  }
  return item.status === "failed";
}

function statusDescription(item: VisualRunResultItem): string {
  const failed = isVisualFailed(item);
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
    (failed ? "Screenshot differs from baseline" : "Matches baseline")
  );
}

function statusTitle(item: VisualRunResultItem): string {
  if (item.status === "skipped") return "Visual test skipped";
  const failed = isVisualFailed(item);
  if (failed) {
    const pct = item.sidecar?.diffPercent;
    return pct != null
      ? `Visual test failed (${pct.toFixed(2)}%)`
      : "Visual test failed";
  }
  const pct = item.sidecar?.diffPercent;
  return pct != null
    ? `Visual test passed (${pct.toFixed(2)}%)`
    : "Visual test passed";
}

export function applyVisualStatuses(results: VisualRunResultItem[]) {
  const storyIds = results.map((item) => item.storyId);
  if (storyIds.length) {
    statusStore.unset(storyIds);
  } else {
    statusStore.unset();
  }
  statusStore.set(
    results.map((item) => {
      const failed = isVisualFailed(item);
      return {
        storyId: item.storyId,
        typeId: STATUS_TYPE_ID_VISUAL,
        value: failed
          ? ("status-value:error" as const)
          : item.status === "skipped"
            ? ("status-value:unknown" as const)
            : ("status-value:success" as const),
        title: statusTitle(item),
        description: statusDescription(item),
        sidebarContextMenu: failed,
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
  if (scope === "all" || !storyId) return undefined;
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

async function readNdjsonRun(
  response: Response,
  onProgress?: (progress: VisualRunProgress) => void,
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

  try {
    while (true) {
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
              storyId: event.storyId,
              status: event.status,
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
  } finally {
    if (generation === ndjsonStreamGeneration) {
      emitVisualRunProgress(null);
    }
  }

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
};

/** Lightweight phase check used before opening a reconnect stream. */
export async function fetchVisualRunStatus(): Promise<VisualRunHubStatus> {
  try {
    const response = await fetch(VISUAL_DELTA_RUN_STATUS_PATH);
    if (!response.ok) {
      return { phase: "idle", total: 0, completed: 0, passed: 0, failed: 0 };
    }
    return (await response.json()) as VisualRunHubStatus;
  } catch {
    return { phase: "idle", total: 0, completed: 0, passed: 0, failed: 0 };
  }
}

/**
 * Reattach to an in-flight or recently finished visual run after manager HMR.
 * Returns `idle` when there is nothing to recover.
 */
export async function reconnectVisualRun(options?: {
  onProgress?: (progress: VisualRunProgress) => void;
}): Promise<VisualRunResponse> {
  const response = await fetch(VISUAL_DELTA_RUN_EVENTS_PATH);
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
    return readNdjsonRun(response, options?.onProgress);
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
}

export async function postVisualRun(
  body: {
    storyIds?: string[];
    rebuild?: boolean;
  },
  options?: {
    onProgress?: (progress: VisualRunProgress) => void;
  },
): Promise<VisualRunResponse> {
  const response = await fetch(VISUAL_DELTA_RUN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("ndjson") || contentType.includes("x-ndjson")) {
    return readNdjsonRun(response, options?.onProgress);
  }

  const data = (await response.json()) as VisualRunResponse;
  if (!response.ok && data == null) {
    throw new Error(`Visual run failed (${response.status})`);
  }
  return data;
}

export async function cancelVisualRun() {
  await fetch(VISUAL_DELTA_CANCEL_PATH, { method: "POST" });
}

export type VisualReviewResponse = {
  ok: boolean;
  storyId: string;
  status: VisualReviewStatus;
  error?: string;
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
};

/** Scaffold portable suite / Playwright config / snapshot dir via middleware. */
export async function postVisualInit(): Promise<VisualInitResponse> {
  const response = await fetch(VISUAL_DELTA_INIT_PATH, { method: "POST" });
  const data = (await response.json()) as VisualInitResponse & {
    error?: string;
  };
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
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `Review status update failed (${response.status})`,
    );
  }
  return data;
}

/**
 * Stamp CSF review tags from visual run outcomes:
 * passed → ready, failed → failed. Skips skipped / timedOut and failures
 * with no committed baseline (those must not become `visual-failed`).
 * Uses one batched middleware call so HMR lands after the write finishes.
 */
export async function postVisualReviewStatusesFromResults(
  results: VisualRunResultItem[],
): Promise<{
  updated: number;
  errors: string[];
  skippedMissingBaseline: number;
}> {
  const skippedMissingBaseline = results.filter(
    (item) => item.status === "failed" && isMissingBaselineFailure(item),
  ).length;
  const updates = reviewUpdatesFromRunResults(results);
  if (!updates.length) {
    return { updated: 0, errors: [], skippedMissingBaseline };
  }

  persistVisualStatusJob({ updates });
  try {
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
    };
    if (!response.ok && data.updated == null) {
      throw new Error(
        data.error || `Review status update failed (${response.status})`,
      );
    }
    clearPersistedVisualStatusJob();
    const rawErrors = data.errors ?? [];
    const softSkipped = rawErrors.filter((error) =>
      isNoBaselineFailedReviewError(error),
    ).length;
    const errors = rawErrors.filter(
      (error) => !isNoBaselineFailedReviewError(error),
    );
    return {
      updated: data.updated ?? 0,
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
    };
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

/** Persist package-wide Playwright pass threshold (%) on the host. */
export async function postPlaywrightPassThreshold(
  passThresholdPercent: number,
): Promise<{ ok: true; playwrightPassThresholdPercent: number }> {
  const response = await fetch(VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passThresholdPercent }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    playwrightPassThresholdPercent?: number;
    passThresholdPercent?: number;
  };
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `Playwright threshold update failed (${response.status})`,
    );
  }
  const next = data.playwrightPassThresholdPercent ?? data.passThresholdPercent;
  if (typeof next !== "number") {
    throw new Error("Playwright threshold response missing percent");
  }
  return { ok: true, playwrightPassThresholdPercent: next };
}

export type VisualSkipVisualResponse = {
  ok: boolean;
  storyId: string;
  skip: boolean;
  error?: string;
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
  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || `skip-visual update failed (${response.status})`,
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
  error?: string;
  logTail?: string;
  /** 1-based index of the current component target (multi-target writes). */
  completed?: number;
  /** Total component targets in this write job. */
  total?: number;
};

type CreateProgressListener = (progress: VisualCreateProgress | null) => void;
const createProgressListeners = new Set<CreateProgressListener>();
let latestCreateProgress: VisualCreateProgress | null = null;

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

function emitVisualCreateProgress(progress: VisualCreateProgress | null) {
  latestCreateProgress = progress;
  for (const listener of createProgressListeners) {
    listener(progress);
  }
}

export type VisualCreateResponse = {
  ok: boolean;
  log: string;
};

async function postVisualBaselineWrite(
  kind: Extract<VisualBaselineJobKind, "create" | "update">,
  body: { storyId: string; rebuild?: boolean },
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
  const fraction = {
    completed: options?.completed,
    total: options?.total,
  };

  emitVisualCreateProgress({
    running: true,
    label: runningLabel,
    kind,
    logTail: "",
    ...fraction,
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
          logTail: log.slice(-12_000),
          ...fraction,
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();

    if (!response.ok) {
      const error = log || `${failVerb} (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        error,
        logTail: log || undefined,
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
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }
    // Older CLIs swallowed Playwright "No tests found" and still exited 0.
    if (
      kind === "create" &&
      (/No tests found/i.test(log) ||
        /Create failed — no baseline PNG/i.test(log))
    ) {
      const error = /Create failed — no baseline PNG[^\n]*/i.exec(log)?.[0]
        ?? "No Playwright visual tests matched (stale skip-visual index or empty scope).";
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
        error,
        logTail: log || undefined,
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
          : /skip-visual/i.test(body.storyId) ||
              body.storyId.endsWith("--closed")
            ? "Created — open a visual story (not skip-visual) to review"
            : "Created";
    } else {
      label = "Updated";
    }

    emitVisualCreateProgress({
      running: false,
      label,
      kind,
      logTail: log || undefined,
      ...fraction,
    });
    return { ok: true, log };
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
      error: message,
      ...fraction,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * One representative story id per component family (prefix before `--`).
 * Prefers a non-skip-visual leaf when available.
 */
export function componentCreateTargets(api: API, storyIds: string[]): string[] {
  const byPrefix = new Map<string, string[]>();
  for (const id of storyIds) {
    const key = id.split("--")[0] ?? id;
    const list = byPrefix.get(key) ?? [];
    list.push(id);
    byPrefix.set(key, list);
  }
  const targets: string[] = [];
  for (const ids of byPrefix.values()) {
    const runnable = visualRunnableStoryIds(api, ids);
    targets.push(runnable[0] ?? ids[0]!);
  }
  return targets;
}

/**
 * Create missing Playwright baselines for a story's component family
 * (`visual-update --create-only`). Shares progress across panel + sidebar.
 */
export async function postVisualCreateBaseline(body: {
  storyId: string;
  rebuild?: boolean;
}): Promise<VisualCreateResponse> {
  return postVisualBaselineWrite("create", body);
}

/**
 * Create missing baselines for each unique component represented by `storyIds`
 * (typically the leaf stories currently listed in the sidebar filter).
 */
export async function postVisualCreateBaselinesForStoryIds(
  api: API,
  storyIds: string[],
  options?: { rebuild?: boolean },
): Promise<void> {
  const targets = componentCreateTargets(api, storyIds);
  if (!targets.length) {
    emitVisualCreateProgress({
      running: false,
      label: "No stories",
      kind: "create",
      error: "No stories visible in the sidebar",
    });
    throw new Error("No stories visible in the sidebar");
  }
  const total = targets.length;
  const rebuild = options?.rebuild;
  for (let i = 0; i < total; i++) {
    const storyId = targets[i]!;
    const completed = i + 1;
    const runningLabel =
      total > 1 ? `Creating… ${completed}/${total}` : "Creating…";
    const isLast = i === total - 1;
    await postVisualBaselineWrite(
      "create",
      // Rebuild only on the first target — later components share the fresh static tree.
      { storyId, rebuild: rebuild && i === 0 ? true : undefined },
      {
        runningLabel,
        completed,
        total,
        successLabel: isLast
          ? total > 1
            ? `Created (${total} components)`
            : undefined
          : runningLabel,
      },
    );
  }
}

/**
 * Overwrite baselines for each unique component represented by `storyIds`
 * (sidebar rewrite / "Rewrite existing").
 */
export async function postVisualUpdateBaselinesForStoryIds(
  api: API,
  storyIds: string[],
  options?: { rebuild?: boolean },
): Promise<void> {
  const targets = componentCreateTargets(api, storyIds);
  if (!targets.length) {
    emitVisualCreateProgress({
      running: false,
      label: "No stories",
      kind: "update",
      error: "No stories visible in the sidebar",
    });
    throw new Error("No stories visible in the sidebar");
  }
  const total = targets.length;
  const rebuild = options?.rebuild;
  for (let i = 0; i < total; i++) {
    const storyId = targets[i]!;
    const completed = i + 1;
    const runningLabel =
      total > 1 ? `Updating… ${completed}/${total}` : "Updating…";
    const isLast = i === total - 1;
    await postVisualBaselineWrite(
      "update",
      { storyId, rebuild: rebuild && i === 0 ? true : undefined },
      {
        runningLabel,
        completed,
        total,
        successLabel: isLast
          ? total > 1
            ? `Updated (${total} components)`
            : undefined
          : runningLabel,
      },
    );
  }
}

/**
 * Overwrite Playwright baselines for a story's component family
 * (`visual-update` with approval). Streams logs like create.
 */
export async function postVisualUpdateBaseline(body: {
  storyId: string;
  rebuild?: boolean;
}): Promise<VisualCreateResponse> {
  return postVisualBaselineWrite("update", body);
}

/**
 * Force `pnpm build-storybook` via middleware (no Playwright capture).
 * Streams logs into the shared create/update progress channel.
 */
export async function postVisualRebuildStatic(): Promise<VisualCreateResponse> {
  const kind = "rebuild" as const;
  const runningLabel = "Rebuilding static…";
  const failedLabel = "Rebuild failed";
  emitVisualCreateProgress({
    running: true,
    label: runningLabel,
    kind,
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
          logTail: log.slice(-12_000),
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();

    if (!response.ok) {
      const error = log || `${failedLabel} (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: failedLabel,
        kind,
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
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }

    emitVisualCreateProgress({
      running: false,
      label: "Static rebuilt",
      kind,
      logTail: log || undefined,
    });
    return { ok: true, log };
  } catch (error) {
    if (
      latestCreateProgress?.running === false &&
      latestCreateProgress.error &&
      latestCreateProgress.kind === kind
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Rebuild storybook-static failed";
    emitVisualCreateProgress({
      running: false,
      label: failedLabel,
      kind,
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
  overwrite?: boolean;
}): Promise<VisualCreateResponse> {
  emitVisualCreateProgress({
    running: true,
    label: body.overwrite ? "Updating interaction…" : "Creating interaction…",
    kind: "interaction",
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
          logTail: log.slice(-12_000),
        });
      }
      log += decoder.decode();
    } else {
      log = await response.text();
    }
    log = log.trim();

    if (!response.ok) {
      const error = log || `Interaction baseline failed (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: "Interaction failed",
        kind: "interaction",
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
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }

    emitVisualCreateProgress({
      running: false,
      label: body.overwrite ? "Interaction updated" : "Interaction created",
      kind: "interaction",
      logTail: log || undefined,
    });
    return { ok: true, log };
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
      error: message,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
