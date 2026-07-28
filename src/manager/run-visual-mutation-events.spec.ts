import { afterEach, describe, expect, it, vi } from "vitest";
import { postVisualReviewStatus } from "./run-visual.js";
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
});
