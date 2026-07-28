import { describe, expect, it } from "vitest";
import {
  baselineAvailability,
  mergeInitReadiness,
  mergeStoryFinished,
  type PreviewReadiness,
} from "./baseline-readiness.js";

const provisional: PreviewReadiness = {
  storyId: "story",
  renderGeneration: 7,
  storyFinished: false,
};

describe("Visual Delta baseline readiness", () => {
  it("keeps a provisional manager seed unknown", () => {
    expect(
      baselineAvailability({
        currentStoryId: "story",
        preview: { ...provisional, renderGeneration: 0 },
        baselineCount: 0,
      }),
    ).toBe("unknown");
  });

  it("hydrates a known baseline before completion without declaring it absent", () => {
    expect(
      baselineAvailability({
        currentStoryId: "story",
        preview: provisional,
        baselineCount: 1,
      }),
    ).toBe("present");
  });

  it("confirms a genuinely missing baseline only after completion", () => {
    expect(
      baselineAvailability({
        currentStoryId: "story",
        preview: provisional,
        baselineCount: 0,
      }),
    ).toBe("unknown");
    expect(
      baselineAvailability({
        currentStoryId: "story",
        preview: { ...provisional, storyFinished: true },
        baselineCount: 0,
      }),
    ).toBe("absent");
  });

  it("preserves completion when a replayed INIT_IMAGE follows storyFinished", () => {
    expect(
      mergeInitReadiness(
        { ...provisional, storyFinished: true },
        { ...provisional, storyFinished: false },
      ),
    ).toEqual({ ...provisional, storyFinished: true });
  });

  it("rejects stale generations and readiness events", () => {
    expect(
      mergeInitReadiness({ ...provisional, renderGeneration: 8 }, provisional),
    ).toBeNull();
    expect(
      mergeStoryFinished(provisional, {
        ...provisional,
        renderGeneration: 6,
        storyFinished: true,
      }),
    ).toBeNull();
  });
});
