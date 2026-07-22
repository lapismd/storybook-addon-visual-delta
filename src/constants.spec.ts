import { describe, expect, it } from "vitest";
import {
  isPlacementMode,
  isSplitPlacement,
  isVisualReviewStatus,
  normalizePlacement,
  visualReviewStatusFromTags,
  visualReviewTagFor,
} from "./constants.js";

describe("normalizePlacement", () => {
  it("maps legacy beside/over and passthroughs known modes", () => {
    expect(normalizePlacement("beside")).toBe("right");
    expect(normalizePlacement("over")).toBe("center");
    expect(normalizePlacement("left")).toBe("left");
    expect(normalizePlacement("bogus")).toBe("right");
    expect(normalizePlacement(undefined)).toBe("right");
  });
});

describe("isPlacementMode / isSplitPlacement", () => {
  it("narrows placement strings", () => {
    expect(isPlacementMode("center")).toBe(true);
    expect(isPlacementMode("beside")).toBe(false);
    expect(isSplitPlacement("right")).toBe(true);
    expect(isSplitPlacement("center")).toBe(false);
  });
});

describe("visual review tags", () => {
  it("round-trips status ↔ tag", () => {
    expect(visualReviewTagFor("pending")).toBe("visual-pending");
    expect(visualReviewTagFor("approved")).toBe("visual-approved");
    expect(visualReviewTagFor("failed")).toBe("visual-failed");
  });

  it("prefers approved over failed over pending", () => {
    expect(
      visualReviewStatusFromTags([
        "visual-pending",
        "visual-failed",
        "visual-approved",
      ]),
    ).toBe("approved");
    expect(visualReviewStatusFromTags(["visual-pending", "visual-failed"])).toBe(
      "failed",
    );
    expect(visualReviewStatusFromTags(["visual-pending"])).toBe("pending");
    expect(visualReviewStatusFromTags([])).toBeNull();
  });

  it("guards status values", () => {
    expect(isVisualReviewStatus("pending")).toBe(true);
    expect(isVisualReviewStatus("nope")).toBe(false);
  });
});
