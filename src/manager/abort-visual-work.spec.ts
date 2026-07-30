import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abortVisualWork,
  clearPersistedVisualStatusJob,
  clearStaleVisualCreateProgress,
  emitVisualCreateProgressForTests,
  emitVisualRunProgressForTests,
  loadPersistedCreateProgress,
  loadPersistedVisualStatusJob,
  peekVisualCreateProgressForTests,
  persistVisualStatusJobForTests,
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
    expect(peekVisualCreateProgressForTests()?.running).toBe(true);
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
    expect(peekVisualCreateProgressForTests()).toBeNull();
    expect(loadPersistedVisualStatusJob()).toBeNull();
    expect(loadPersistedCreateProgress()).toBeNull();

    unsubscribeRun();
    unsubscribeCreate();
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
    expect(peekVisualCreateProgressForTests()).toBeNull();
    expect(loadPersistedCreateProgress()).toBeNull();
  });
});
