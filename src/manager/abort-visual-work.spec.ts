import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abortVisualWork,
  clearPersistedVisualStatusJob,
  clearStaleVisualCreateProgress,
  emitVisualCreateProgressForTests,
  emitVisualRunProgressForTests,
  loadPersistedCreateProgress,
  loadPersistedVisualStatusJob,
  peekVisualCreateProgress,
  persistVisualStatusJobForTests,
  reconnectVisualRun,
  subscribeVisualCreateProgress,
  subscribeVisualRunProgress,
  type VisualCreateProgress,
  type VisualRunProgress,
} from "./run-visual.js";

afterEach(() => {
  vi.unstubAllGlobals();
  clearStaleVisualCreateProgress();
  clearPersistedVisualStatusJob();
  emitVisualRunProgressForTests(null);
});

describe("abortVisualWork", () => {
  it("clears run progress, create progress, and status jobs when no child is alive", async () => {
    const runUpdates: Array<VisualRunProgress | null> = [];
    const createUpdates: Array<VisualCreateProgress | null> = [];
    const unsubscribeRun = subscribeVisualRunProgress((next) => {
      runUpdates.push(next);
    });
    const unsubscribeCreate = subscribeVisualCreateProgress((next) => {
      createUpdates.push(next);
    });

    // Seed orphan presentation as if HMR left buses mid-write.
    emitVisualRunProgressForTests({
      completed: 1,
      total: 3,
      passed: 1,
      failed: 0,
    });
    emitVisualCreateProgressForTests({
      running: true,
      label: "Updating…",
      kind: "update",
      storyIds: ["story--a"],
    });
    persistVisualStatusJobForTests({
      updates: [{ storyId: "story--a", status: "ready" }],
    });
    expect(peekVisualCreateProgress()?.running).toBe(true);
    expect(loadPersistedVisualStatusJob()?.updates).toHaveLength(1);
    expect(loadPersistedCreateProgress()?.running).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, cancelled: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await abortVisualWork();
    expect(result).toEqual({ ok: true, cancelled: false });
    expect(runUpdates.at(-1)).toBeNull();
    expect(createUpdates.at(-1)).toBeNull();
    expect(peekVisualCreateProgress()).toBeNull();
    expect(loadPersistedVisualStatusJob()).toBeNull();
    expect(loadPersistedCreateProgress()).toBeNull();

    unsubscribeRun();
    unsubscribeCreate();
  });

  it("unblocks a hung reconnect NDJSON stream so Testing Module can leave running", async () => {
    let released = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "start", total: 1 })}\n`,
          ),
        );
        // Never closes — simulates a stuck hub subscriber.
        const timer = setInterval(() => {
          if (released) {
            clearInterval(timer);
            try {
              controller.close();
            } catch {
              /* already cancelled */
            }
          }
        }, 20);
      },
      cancel() {
        released = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("cancel")) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true, cancelled: false }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(stream, {
            headers: { "content-type": "application/x-ndjson" },
          }),
        );
      }),
    );

    const reconnect = reconnectVisualRun();
    await new Promise((r) => setTimeout(r, 30));
    await abortVisualWork();
    await expect(reconnect).resolves.toMatchObject({
      ok: true,
      cancelled: true,
      idle: true,
    });
  });
});

describe("clearStaleVisualCreateProgress", () => {
  it("drops orphan running create progress when hub/writer are idle", () => {
    emitVisualCreateProgressForTests({
      running: true,
      label: "Creating…",
      kind: "create",
      storyIds: ["story--b"],
    });
    expect(loadPersistedCreateProgress()?.running).toBe(true);
    clearStaleVisualCreateProgress();
    expect(peekVisualCreateProgress()).toBeNull();
    expect(loadPersistedCreateProgress()).toBeNull();
  });
});
