import { describe, expect, it, beforeEach } from "vitest";
import {
  beginVisualRunHub,
  cancelVisualRunHub,
  getVisualRunHubStatus,
  peekVisualRunHubForTests,
  publishVisualRunEvent,
  resetVisualRunHub,
  RUN_HUB_DONE_TTL_MS,
} from "./run-hub.js";

describe("visual run hub", () => {
  beforeEach(() => {
    resetVisualRunHub();
  });

  it("tracks running progress for status peeks", () => {
    beginVisualRunHub();
    publishVisualRunEvent({ type: "start", total: 10 });
    publishVisualRunEvent({
      type: "progress",
      completed: 3,
      total: 10,
      passed: 2,
      failed: 1,
      storyId: "shadcn-button--default",
      status: "passed",
    });
    expect(getVisualRunHubStatus()).toEqual({
      phase: "running",
      total: 10,
      completed: 3,
      passed: 2,
      failed: 1,
    });
    expect(peekVisualRunHubForTests().eventCount).toBe(2);
  });

  it("keeps a done snapshot until TTL", () => {
    beginVisualRunHub();
    publishVisualRunEvent({ type: "start", total: 1 });
    publishVisualRunEvent({
      type: "done",
      ok: true,
      exitCode: 0,
      rebuild: false,
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    });
    expect(getVisualRunHubStatus().phase).toBe("done");
    expect(RUN_HUB_DONE_TTL_MS).toBeGreaterThan(0);
  });

  it("cancel publishes a terminal event then returns the hub to idle", () => {
    beginVisualRunHub();
    publishVisualRunEvent({ type: "start", total: 2 });
    expect(getVisualRunHubStatus().phase).toBe("running");
    cancelVisualRunHub({ hadChild: true });
    expect(getVisualRunHubStatus().phase).toBe("idle");
    expect(peekVisualRunHubForTests().eventCount).toBe(0);
  });
});
