import { VISUAL_DELTA_RUNTIME_PATH } from "../constants.js";

const INSTALL_GUARD = "__VISUAL_DELTA_RUNTIME_RELOAD_WATCHER__";
const DEFAULT_INTERVAL_MS = 1_000;

export type VisualDeltaRuntimeRead =
  | { kind: "runtime"; instanceId: string }
  | { kind: "retry" }
  | { kind: "unsupported" };

type FetchRuntime = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export async function readVisualDeltaRuntime(
  fetchRuntime: FetchRuntime = globalThis.fetch,
): Promise<VisualDeltaRuntimeRead> {
  let response: Pick<Response, "ok" | "status" | "json">;
  try {
    response = await fetchRuntime(VISUAL_DELTA_RUNTIME_PATH, {
      cache: "no-store",
    });
  } catch {
    return { kind: "retry" };
  }

  if (response.status === 404) return { kind: "unsupported" };
  if (!response.ok) return { kind: "retry" };

  try {
    const payload = (await response.json()) as {
      ok?: unknown;
      instanceId?: unknown;
    };
    if (
      payload.ok !== true ||
      typeof payload.instanceId !== "string" ||
      payload.instanceId.trim() === ""
    ) {
      return { kind: "unsupported" };
    }
    return { kind: "runtime", instanceId: payload.instanceId };
  } catch {
    return { kind: "unsupported" };
  }
}

export interface VisualDeltaReloadWatcherOptions {
  intervalMs?: number;
  readRuntime?: () => Promise<VisualDeltaRuntimeRead>;
  reload?: () => void;
}

/**
 * Poll one development server identity. Connection failures are expected
 * during restart, so only an unsupported/malformed endpoint stops the watcher.
 */
export function startVisualDeltaReloadWatcher({
  intervalMs = DEFAULT_INTERVAL_MS,
  readRuntime = () => readVisualDeltaRuntime(),
  reload = () => globalThis.location.reload(),
}: VisualDeltaReloadWatcherOptions = {}): () => void {
  let currentInstanceId: string | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    timer = setTimeout(() => void poll(), intervalMs);
  };

  const poll = async () => {
    const result = await readRuntime().catch(
      (): VisualDeltaRuntimeRead => ({ kind: "retry" }),
    );
    if (stopped) return;

    if (result.kind === "unsupported") {
      stopped = true;
      return;
    }

    if (result.kind === "runtime") {
      if (currentInstanceId == null) {
        currentInstanceId = result.instanceId;
      } else if (result.instanceId !== currentInstanceId) {
        stopped = true;
        reload();
        return;
      }
    }

    schedule();
  };

  void poll();

  return () => {
    stopped = true;
    if (timer != null) clearTimeout(timer);
  };
}

/**
 * Install once even if Storybook evaluates the manager entry more than once.
 * The guard intentionally remains set when an unsupported endpoint stops the
 * watcher: hosts without the middleware should stay quiet for the session.
 */
export function installVisualDeltaReloadWatcher(
  options: VisualDeltaReloadWatcherOptions & {
    globalObject?: Record<string, unknown>;
  } = {},
): boolean {
  const { globalObject = globalThis as unknown as Record<string, unknown> } =
    options;
  if (globalObject[INSTALL_GUARD] === true) return false;
  globalObject[INSTALL_GUARD] = true;
  startVisualDeltaReloadWatcher(options);
  return true;
}
