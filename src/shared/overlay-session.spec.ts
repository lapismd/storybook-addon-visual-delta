import { describe, expect, it } from "vitest";
import {
  opacityForPlacementChange,
  placementToggleAction,
  revealCenteredOverlayPatch,
  shouldSoftShowOverlay,
  type OverlaySessionSnapshot,
} from "./overlay-session.js";

const base: OverlaySessionSnapshot = {
  overlayOn: true,
  placement: "right",
  index: 0,
  imageCount: 1,
  opacity: 1,
};

describe("opacityForPlacementChange", () => {
  it("forces opacity 1 when entering split from center", () => {
    expect(opacityForPlacementChange("center", "left", 0.5)).toBe(1);
  });

  it("keeps opacity when moving between split modes", () => {
    expect(opacityForPlacementChange("left", "right", 0.7)).toBe(0.7);
  });

  it("drops full opacity to 0.5 when leaving split for center", () => {
    expect(opacityForPlacementChange("right", "center", 1)).toBe(0.5);
    expect(opacityForPlacementChange("right", "center", 0.4)).toBe(0.4);
  });
});

describe("placementToggleAction", () => {
  it("soft-hides when the active placement is pressed again", () => {
    expect(placementToggleAction(base, "right")).toEqual({ type: "soft-hide" });
  });

  it("shows a new placement and preserves a valid selection index", () => {
    expect(placementToggleAction(base, "left")).toEqual({
      type: "show",
      placement: "left",
      index: 0,
      opacity: 1,
    });
  });

  it("selects the first image when none selected but images exist", () => {
    expect(
      placementToggleAction({ ...base, overlayOn: false, index: -1 }, "center"),
    ).toMatchObject({ type: "show", index: 0, placement: "center" });
  });
});

describe("shouldSoftShowOverlay", () => {
  it("is true only when re-showing the same hidden selection", () => {
    const hidden = { ...base, overlayOn: false };
    expect(shouldSoftShowOverlay(hidden, "right", 0)).toBe(true);
    expect(shouldSoftShowOverlay(hidden, "left", 0)).toBe(false);
    expect(shouldSoftShowOverlay(base, "right", 0)).toBe(false);
  });
});

describe("revealCenteredOverlayPatch", () => {
  it("centers with index -1 when there are no images yet", () => {
    expect(
      revealCenteredOverlayPatch({
        index: 0,
        imageCount: 0,
        placement: "right",
        opacity: 1,
      }),
    ).toEqual({
      overlayOn: true,
      placement: "center",
      liveVisible: true,
      index: -1,
      opacity: 1,
    });
  });

  it("keeps or defaults index when images exist", () => {
    expect(
      revealCenteredOverlayPatch({
        index: -1,
        imageCount: 2,
        placement: "right",
        opacity: 1,
      }),
    ).toMatchObject({ index: 0, placement: "center", overlayOn: true });
  });
});
