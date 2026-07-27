import { afterEach, describe, expect, it, vi } from "vitest";
import {
  postVisualActionScope,
  reconnectVisualRun,
  type VisualRunProgress,
} from "./run-visual.js";
import type { VisualActionScopeProgress } from "../shared/affected-types.js";

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

describe("postVisualActionScope", () => {
  it("reports streamed preflight phases before returning the frozen scope", async () => {
    const events = [
      {
        type: "progress",
        phase: "resolving",
        message: "Resolving affected scope…",
      },
      {
        type: "progress",
        phase: "rebuilding",
        message: "Rebuilding Storybook static… 12s",
        elapsedMs: 12_000,
      },
      {
        type: "progress",
        phase: "freezing",
        message: "Freezing 2 affected stories…",
      },
      {
        type: "done",
        ok: true,
        storyIds: ["menu--checkboxes", "dialog--default"],
        summary: {
          selection: "affected",
          selected: 2,
          unchanged: 3,
          total: 5,
          noChange: false,
          storyIds: ["menu--checkboxes", "dialog--default"],
        },
        rebuilt: true,
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`${events}\n`, {
          headers: { "content-type": "application/x-ndjson" },
        }),
      ),
    );
    const progress: VisualActionScopeProgress[] = [];

    const result = await postVisualActionScope(
      {
        visibleStoryIds: [
          "menu--checkboxes",
          "dialog--default",
          "hidden--story",
        ],
        affectedOnly: true,
      },
      {
        onProgress: (next) => progress.push(next),
      },
    );

    expect(progress).toEqual([
      {
        phase: "resolving",
        message: "Resolving affected scope…",
      },
      {
        phase: "rebuilding",
        message: "Rebuilding Storybook static… 12s",
        elapsedMs: 12_000,
      },
      {
        phase: "freezing",
        message: "Freezing 2 affected stories…",
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      rebuilt: true,
      storyIds: ["menu--checkboxes", "dialog--default"],
      summary: { selected: 2, unchanged: 3, total: 5 },
    });
  });

  it("surfaces a streamed preflight failure", async () => {
    const events = [
      {
        type: "progress",
        phase: "rebuilding",
        message: "Rebuilding Storybook static… 1s",
        elapsedMs: 1_000,
      },
      {
        type: "error",
        error: "build-storybook failed while refreshing the affected scope",
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`${events}\n`, {
          headers: { "content-type": "application/x-ndjson" },
        }),
      ),
    );

    await expect(
      postVisualActionScope({
        visibleStoryIds: ["menu--checkboxes"],
        affectedOnly: true,
      }),
    ).rejects.toThrow(
      "build-storybook failed while refreshing the affected scope",
    );
  });
});
