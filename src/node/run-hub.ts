import type { ServerResponse } from "node:http";

/** Per-story outcome from a visual Playwright run. */
export type VisualRunResultItem = {
  storyId: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  title: string;
  error?: string;
  sidecar?: unknown;
  modeResults?: unknown[];
  /** Set when the story failed because no committed baseline PNG exists. */
  missingBaseline?: boolean;
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

/** NDJSON events streamed while a visual run is in progress or replayed on reconnect. */
export type VisualRunStreamEvent =
  | { type: "idle" }
  | { type: "start"; total: number }
  | {
      type: "progress";
      completed: number;
      total: number;
      passed: number;
      failed: number;
      storyId: string;
      status: "passed" | "failed";
    }
  | { type: "log"; line: string }
  | ({ type: "done" } & VisualRunResponse)
  | { type: "error"; error: string; crashed?: boolean };

type HubPhase = "idle" | "running" | "done";

const MAX_EVENTS = 500;

type RunHubState = {
  phase: HubPhase;
  events: VisualRunStreamEvent[];
  subscribers: Set<ServerResponse>;
  /** Keep the last finished run briefly so HMR can still hydrate results. */
  doneAt: number | null;
};

const hub: RunHubState = {
  phase: "idle",
  events: [],
  subscribers: new Set(),
  doneAt: null,
};

/** How long a finished run stays available for reconnect (ms). */
export const RUN_HUB_DONE_TTL_MS = 5 * 60_000;

function writeNdjson(res: ServerResponse, event: VisualRunStreamEvent) {
  try {
    res.write(`${JSON.stringify(event)}\n`);
  } catch {
    hub.subscribers.delete(res);
  }
}

function beginNdjson(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

function expireDoneIfStale() {
  if (
    hub.phase === "done" &&
    hub.doneAt != null &&
    Date.now() - hub.doneAt > RUN_HUB_DONE_TTL_MS
  ) {
    hub.phase = "idle";
    hub.events = [];
    hub.doneAt = null;
  }
}

/** True while Playwright is running (not merely a recent done snapshot). */
export function isVisualRunActive(): boolean {
  return hub.phase === "running";
}

/** True when a run is active or a recent finished snapshot is still available. */
export function hasVisualRunSnapshot(): boolean {
  expireDoneIfStale();
  return hub.phase === "running" || hub.phase === "done";
}

export type VisualRunHubStatus = {
  phase: HubPhase;
  total: number;
  completed: number;
  passed: number;
  failed: number;
};

/** Lightweight JSON status for manager remount (avoid opening an NDJSON stream). */
export function getVisualRunHubStatus(): VisualRunHubStatus {
  expireDoneIfStale();
  let total = 0;
  let completed = 0;
  let passed = 0;
  let failed = 0;
  for (const event of hub.events) {
    if (event.type === "start") total = event.total;
    if (event.type === "progress") {
      completed = event.completed;
      total = event.total;
      passed = event.passed;
      failed = event.failed;
    }
    if (event.type === "done") {
      total = event.summary.total || total;
      completed = event.summary.total || completed;
      passed = event.summary.passed;
      failed = event.summary.failed;
    }
  }
  return { phase: hub.phase, total, completed, passed, failed };
}

/** Reset and mark a new run (call before the first event). */
export function beginVisualRunHub(): void {
  for (const res of hub.subscribers) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  hub.subscribers.clear();
  hub.phase = "running";
  hub.events = [];
  hub.doneAt = null;
}

/** Publish an event to the hub and all live subscribers. */
export function publishVisualRunEvent(event: VisualRunStreamEvent): void {
  if (event.type === "idle") return;

  hub.events.push(event);
  if (hub.events.length > MAX_EVENTS) {
    // Keep start + recent progress/logs; drop oldest middle events.
    const start = hub.events.find((e) => e.type === "start");
    hub.events = [
      ...(start ? [start] : []),
      ...hub.events.slice(-(MAX_EVENTS - (start ? 1 : 0))),
    ];
  }

  if (event.type === "done" || event.type === "error") {
    // error may be followed by done; only mark done on done.
  }
  if (event.type === "done") {
    hub.phase = "done";
    hub.doneAt = Date.now();
  }

  for (const res of [...hub.subscribers]) {
    writeNdjson(res, event);
    if (event.type === "done") {
      try {
        res.end();
      } catch {
        /* ignore */
      }
      hub.subscribers.delete(res);
    }
  }
}

/**
 * Attach `res` as an NDJSON subscriber.
 * Replays buffered events, then keeps the connection open while running.
 * When idle (or done TTL expired), sends `{ type: "idle" }` and ends.
 */
export function subscribeVisualRunHub(res: ServerResponse): void {
  expireDoneIfStale();
  beginNdjson(res);

  if (hub.phase === "idle") {
    writeNdjson(res, { type: "idle" });
    res.end();
    return;
  }

  for (const event of hub.events) {
    writeNdjson(res, event);
  }

  if (hub.phase === "done") {
    res.end();
    return;
  }

  hub.subscribers.add(res);
  const onClose = () => {
    hub.subscribers.delete(res);
    res.off("close", onClose);
  };
  res.on("close", onClose);
}

/** Drop subscribers and clear state (e.g. after cancel). */
export function resetVisualRunHub(): void {
  for (const res of hub.subscribers) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  hub.subscribers.clear();
  hub.phase = "idle";
  hub.events = [];
  hub.doneAt = null;
}

/** Test helper — inspect hub without mutating. */
export function peekVisualRunHubForTests(): {
  phase: HubPhase;
  eventCount: number;
  subscriberCount: number;
} {
  return {
    phase: hub.phase,
    eventCount: hub.events.length,
    subscriberCount: hub.subscribers.size,
  };
}
