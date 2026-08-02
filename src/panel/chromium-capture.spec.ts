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
});
