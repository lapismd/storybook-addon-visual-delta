import { describe, expect, it } from "vitest";
import {
  initImageSelection,
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
    // Soft-hide keeps gallery index in panel state; preview tears down DOM
    // separately so the live canvas can reclaim space.
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
    // Soft-hide keeps prior placement; soft-show is clicking that cell again.
    const hidden = { ...base, overlayOn: false };
    expect(shouldSoftShowOverlay(hidden, "right", 0)).toBe(true);
    expect(shouldSoftShowOverlay(hidden, "left", 0)).toBe(false);
    expect(shouldSoftShowOverlay(base, "right", 0)).toBe(false);
  });
});

describe("initImageSelection", () => {
  it("keeps gallery index when soft-hidden so Diff/DiffResult still have a baseline", () => {
    expect(
      initImageSelection({
        imageCount: 1,
        overlayOnPref: false,
        liveVisible: true,
        interactionPinned: false,
      }),
    ).toEqual({ index: 0, overlayOn: false, previewIndex: -1 });
  });

  it("shows overlay when prefs say overlayOn", () => {
    expect(
      initImageSelection({
        imageCount: 2,
        overlayOnPref: true,
        liveVisible: true,
        interactionPinned: false,
      }),
    ).toEqual({ index: 0, overlayOn: true, previewIndex: 0 });
  });

  it("forces overlay on for image-only and interaction pins", () => {
    expect(
      initImageSelection({
        imageCount: 1,
        overlayOnPref: false,
        liveVisible: false,
        interactionPinned: false,
      }),
    ).toMatchObject({ index: 0, overlayOn: true, previewIndex: 0 });
    expect(
      initImageSelection({
        imageCount: 1,
        overlayOnPref: false,
        liveVisible: true,
        interactionPinned: true,
      }),
    ).toMatchObject({ index: 0, overlayOn: true, previewIndex: 0 });
  });

  it("uses index -1 when there are no images", () => {
    expect(
      initImageSelection({
        imageCount: 0,
        overlayOnPref: true,
        liveVisible: true,
        interactionPinned: false,
      }),
    ).toEqual({ index: -1, overlayOn: false, previewIndex: -1 });
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
