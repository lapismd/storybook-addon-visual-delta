import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasActiveVisualBaselineWriteRequest,
  postVisualCreateBaseline,
  postVisualReviewStatus,
  subscribeVisualCreateProgress,
} from "./run-visual.js";
import { VISUAL_DELTA_CHANGES_EVENT } from "../shared/change-events.js";
import type { VisualDeltaChangeSetMutation } from "../shared/change-sets.js";

describe("Visual Delta mutation events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes a failed mutation for review before rejecting the action", async () => {
    const changes: VisualDeltaChangeSetMutation = {
      changeSetId: "change-set",
      operationId: "operation",
      mode: "review",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            storyId: "story",
            status: "approved",
            error: "source patch failed",
            changes,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    const received: VisualDeltaChangeSetMutation[] = [];
    const listener = (event: Event) => {
      received.push(
        (event as CustomEvent<VisualDeltaChangeSetMutation>).detail,
      );
    };
    window.addEventListener(VISUAL_DELTA_CHANGES_EVENT, listener);

    await expect(
      postVisualReviewStatus({
        storyId: "story",
        status: "approved",
      }),
    ).rejects.toThrow("source patch failed");
    expect(received).toEqual([changes]);

    window.removeEventListener(VISUAL_DELTA_CHANGES_EVENT, listener);
  });

  it("publishes the exact story scope with baseline-write progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "[exit 0]\nStory visualDelta patch: 1 updated, 0 already wired\n",
          {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          },
        ),
      ),
    );
    const received: unknown[] = [];
    const unsubscribe = subscribeVisualCreateProgress((progress) => {
      if (progress) received.push(progress);
    });

    await postVisualCreateBaseline({ storyId: "filter--source" });

    expect(received.length).toBeGreaterThan(0);
    for (const progress of received) {
      expect(progress).toMatchObject({
        kind: "create",
        storyIds: ["filter--source"],
      });
    }
    unsubscribe();
  });

  it("identifies a locally active baseline write until its response settles", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishRequest = resolve;
          }),
      ),
    );

    const request = postVisualCreateBaseline({ storyId: "filter--source" });
    expect(hasActiveVisualBaselineWriteRequest()).toBe(true);

    finishRequest?.(
      new Response(
        "[exit 0]\nStory visualDelta patch: 1 updated, 0 already wired\n",
        { status: 200, headers: { "Content-Type": "text/plain" } },
      ),
    );
    await request;

    expect(hasActiveVisualBaselineWriteRequest()).toBe(false);
  });
});
