import { afterEach, describe, expect, it, vi } from "vitest";
import { reconnectVisualRun, type VisualRunProgress } from "./run-visual.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reconnectVisualRun", () => {
  it("recovers progress and the completed result from an NDJSON run stream", async () => {
    const done = {
      type: "done",
      ok: true,
      exitCode: 0,
      rebuild: false,
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [{ storyId: "visual--ready", title: "Ready", status: "passed" }],
      logTail: "passed",
    };
    const stream = [
      { type: "start", total: 1 },
      {
        type: "progress",
        total: 1,
        completed: 1,
        passed: 1,
        failed: 0,
        storyId: "visual--ready",
        status: "passed",
      },
      done,
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`${stream}\n`, {
          headers: { "content-type": "application/x-ndjson" },
        }),
      ),
    );
    const progress: VisualRunProgress[] = [];

    const result = await reconnectVisualRun({
      onProgress: (next) => progress.push(next),
    });

    expect(progress).toEqual([
      { completed: 0, total: 1, passed: 0, failed: 0 },
      {
        completed: 1,
        total: 1,
        passed: 1,
        failed: 0,
        storyId: "visual--ready",
        status: "passed",
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [{ storyId: "visual--ready", status: "passed" }],
    });
  });

  it("returns a recoverable error when the reconnect endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(reconnectVisualRun()).resolves.toMatchObject({
      ok: false,
      crashed: true,
      idle: true,
      error: "Reconnect failed (503)",
    });
  });
});
