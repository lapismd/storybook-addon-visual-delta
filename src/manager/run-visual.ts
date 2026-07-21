import {
  experimental_getStatusStore,
  type API,
} from "storybook/manager-api";
import {
  STATUS_TYPE_ID_VISUAL,
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_CREATE_PATH,
  VISUAL_DELTA_RUN_PATH,
} from "../constants.js";
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
};

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
  | { type: "start"; total: number }
  | ({ type: "progress" } & VisualRunProgress)
  | ({ type: "done" } & VisualRunResponse)
  | { type: "error"; error: string; crashed?: boolean };

export type VisualRunScope = "story" | "component" | "all";

export type VisualLastRunSummary = {
  finishedAt: number;
  summary: VisualRunResponse["summary"];
  error?: string;
  scope?: VisualRunScope;
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
  if (sc && typeof sc.diffPercent === "number" && typeof sc.diffPixels === "number") {
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

async function readNdjsonRun(
  response: Response,
  onProgress?: (progress: VisualRunProgress) => void,
): Promise<VisualRunResponse> {
  const body = response.body;
  if (!body) {
    throw new Error("Visual run response had no body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: VisualRunResponse | null = null;
  let streamError: string | undefined;

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
    emitVisualRunProgress(null);
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
  if (
    contentType.includes("ndjson") ||
    contentType.includes("x-ndjson")
  ) {
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

export type VisualCreateProgress = {
  running: boolean;
  label: string;
  error?: string;
  logTail?: string;
};

type CreateProgressListener = (progress: VisualCreateProgress | null) => void;
const createProgressListeners = new Set<CreateProgressListener>();
let latestCreateProgress: VisualCreateProgress | null = null;

/** Subscribe to create-baseline progress from panel or sidebar. */
export function subscribeVisualCreateProgress(listener: CreateProgressListener) {
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

/**
 * Create missing Playwright baselines for a story's component family
 * (`visual-update --create-only`). Shares progress across panel + sidebar.
 */
export async function postVisualCreateBaseline(body: {
  storyId: string;
}): Promise<VisualCreateResponse> {
  emitVisualCreateProgress({ running: true, label: "Creating…" });
  try {
    const response = await fetch(VISUAL_DELTA_CREATE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const log = text.trim();
    if (!response.ok) {
      const error =
        log || `Create baselines failed (${response.status})`;
      emitVisualCreateProgress({
        running: false,
        label: "Create failed",
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }
    const exitMatch = text.match(/\[exit (\d+)\]/);
    if (exitMatch && exitMatch[1] !== "0") {
      const error = `Baseline create exited with code ${exitMatch[1]}`;
      emitVisualCreateProgress({
        running: false,
        label: "Create failed",
        error,
        logTail: log || undefined,
      });
      throw new Error(error);
    }
    emitVisualCreateProgress({
      running: false,
      label: "Created",
      logTail: log || undefined,
    });
    return { ok: true, log };
  } catch (error) {
    if (
      latestCreateProgress?.running === false &&
      latestCreateProgress.error
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Baseline create failed";
    emitVisualCreateProgress({
      running: false,
      label: "Create failed",
      error: message,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
