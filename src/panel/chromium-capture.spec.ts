import { afterEach, describe, expect, it, vi } from "vitest";
import { VISUAL_DELTA_COMPARE_STORY_PATH } from "../constants.js";
import { VISUAL_DELTA_CHANGES_EVENT } from "../shared/change-events.js";
import { postChromiumStoryCompare } from "./chromium-capture.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postChromiumStoryCompare", () => {
  it("returns comparison and auto-approval results independently", async () => {
    const changes = {
      operationId: "operation-1",
      changeSetId: "change-set-1",
      mode: "review" as const,
    };
    const done = {
      type: "done" as const,
      ok: true as const,
      storyId: "dialog--opens",
      sidecar: {
        version: 2 as const,
        storyId: "dialog--opens",
        snapshotRel: "dialog--opens.png",
        status: "passed" as const,
        runnerStatus: "passed" as const,
        outcome: "passed" as const,
        generatedAt: "2026-07-28T12:00:00.000Z",
        tool: "playwright" as const,
      },
      review: {
        autoAccepted: true as const,
        applied: false,
        status: "approved" as const,
        error: "source patch failed",
        changes,
      },
    };
    const onChanges = vi.fn();
    window.addEventListener(VISUAL_DELTA_CHANGES_EVENT, onChanges);
    const fetchMock = vi.fn(async () => {
      return new Response(
        `${JSON.stringify({ type: "log", line: "Installing clean workspace…\n" })}\n${JSON.stringify(done)}\n`,
        {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLog = vi.fn();
    const result = await postChromiumStoryCompare(
      {
        storyId: "dialog--opens",
        baselineUrl: "/visual-baselines/dialog--opens.png",
      },
      { onLog },
    );

    expect(result.sidecar.outcome).toBe("passed");
    expect(result.review).toMatchObject({
      autoAccepted: true,
      applied: false,
      error: "source patch failed",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      VISUAL_DELTA_COMPARE_STORY_PATH,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"storyId":"dialog--opens"'),
      }),
    );
    expect(onChanges).toHaveBeenCalledOnce();
    expect(onLog).toHaveBeenCalledWith("Installing clean workspace…\n");
    expect((onChanges.mock.calls[0]?.[0] as CustomEvent).detail).toEqual(
      changes,
    );
    window.removeEventListener(VISUAL_DELTA_CHANGES_EVENT, onChanges);
  });

  it("preserves ANSI log bytes split across NDJSON stream chunks", async () => {
    const ansiLine = "\u001b[32;1m✓ passed\u001b[0m\n";
    const done = {
      type: "done" as const,
      ok: true as const,
      storyId: "dialog--opens",
      target: { browser: "chromium" as const },
      environment: { browser: "chromium" as const, platform: "linux" },
      sidecar: {
        version: 4 as const,
        storyId: "dialog--opens",
        snapshotRel: "dialog--opens-chromium.png",
        status: "passed" as const,
        runnerStatus: "passed" as const,
        outcome: "passed" as const,
        generatedAt: "2026-08-03T10:00:00.000Z",
        tool: "playwright" as const,
      },
    };
    const payload = `${JSON.stringify({ type: "log", line: ansiLine })}\n${JSON.stringify(done)}\n`;
    const splitAt = payload.indexOf("001b") + 2;
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload.slice(0, splitAt)));
        controller.enqueue(encoder.encode(payload.slice(splitAt)));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        }),
      ),
    );
    const onLog = vi.fn();

    await postChromiumStoryCompare(
      {
        storyId: "dialog--opens",
        baselineUrl: "/visual-baselines/dialog--opens-chromium.png",
      },
      { onLog },
    );

    expect(onLog).toHaveBeenCalledOnce();
    expect(onLog).toHaveBeenCalledWith(ansiLine);
  });
});
