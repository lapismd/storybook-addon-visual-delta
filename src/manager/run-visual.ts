import {
  experimental_getStatusStore,
  type API,
} from "storybook/manager-api";
import {
  STATUS_TYPE_ID_VISUAL,
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_RUN_PATH,
} from "../constants.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";

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

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);

type ProgressListener = (progress: VisualRunProgress | null) => void;
const progressListeners = new Set<ProgressListener>();

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

function statusDescription(item: VisualRunResultItem): string {
  const failed = item.status === "failed" || item.status === "timedOut";
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
  const failed = item.status === "failed" || item.status === "timedOut";
  if (item.status === "skipped") return "Visual test skipped";
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
      const failed = item.status === "failed" || item.status === "timedOut";
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

export function clearVisualStatuses() {
  statusStore.unset();
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
