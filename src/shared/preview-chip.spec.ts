import { afterEach, describe, expect, it } from "vitest";
import {
  MODE_BADGE_ID,
  OVERLAY_CHIP_ID,
  OVERLAY_CHIP_LABEL,
  ensureOverlayChip,
  isPreviewChipVisible,
  positionOverlayChip,
  syncModeBadge,
} from "./preview-chip.js";

afterEach(() => {
  document.getElementById(MODE_BADGE_ID)?.remove();
  document.getElementById(OVERLAY_CHIP_ID)?.remove();
  document.querySelectorAll("[id^='visual-delta-demo-chip-']").forEach((el) => {
    el.remove();
  });
});

describe("ensureOverlayChip", () => {
  it("attaches a Baseline chip as a child of the overlay", () => {
    const overlay = document.createElement("div");
    const img = document.createElement("img");
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    const chip = ensureOverlayChip(overlay);

    expect(chip.id).toBe(OVERLAY_CHIP_ID);
    expect(chip.textContent).toBe(OVERLAY_CHIP_LABEL);
    expect(chip.parentElement).toBe(overlay);
    expect(chip.getAttribute("data-testid")).toBe("baseline-overlay-chip");
    expect(overlay.children[0]).toBe(img);
    expect(overlay.children[1]).toBe(chip);
    expect(chip.style.position).toBe("absolute");
    // jsdom gives 0×0 layout boxes; visibility is asserted in Storybook plays.
    expect(typeof isPreviewChipVisible(chip)).toBe("boolean");

    overlay.remove();
  });

  it("keeps one chip when called again (split + center re-style)", () => {
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    ensureOverlayChip(overlay);
    ensureOverlayChip(overlay);

    expect(overlay.querySelectorAll("#" + OVERLAY_CHIP_ID)).toHaveLength(1);
    overlay.remove();
  });

  it("supports per-placement ids for catalog demos", () => {
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    const chip = ensureOverlayChip(overlay, {
      id: "visual-delta-demo-chip-left",
    });
    expect(chip.id).toBe("visual-delta-demo-chip-left");
    expect(chip.textContent).toBe(OVERLAY_CHIP_LABEL);
    overlay.remove();
  });

  it("keeps the absolute label inside the image without reserving a gutter", () => {
    const parent = document.createElement("div");
    const overlay = document.createElement("div");
    parent.appendChild(overlay);
    document.body.appendChild(parent);
    const chip = ensureOverlayChip(overlay, {
      offset: { x: 4, y: -2 },
      position: false,
    });
    Object.defineProperty(parent, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
      }),
    });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 20,
        top: 40,
        right: 220,
        bottom: 140,
        width: 200,
        height: 100,
      }),
    });
    Object.defineProperty(chip, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 60,
        bottom: 18,
        width: 60,
        height: 18,
      }),
    });

    positionOverlayChip(overlay, { x: 4, y: -2 });

    expect(chip.style.left).toBe("10px");
    expect(chip.style.top).toBe("4px");
    parent.remove();
  });
});

describe("syncModeBadge", () => {
  it("keeps image-only mode free of a duplicate fixed badge", () => {
    const stale = document.createElement("div");
    stale.id = MODE_BADGE_ID;
    stale.textContent = "Image only";
    document.documentElement.appendChild(stale);

    syncModeBadge(true);
    expect(document.getElementById(MODE_BADGE_ID)).toBeNull();
    syncModeBadge(false);
    expect(document.getElementById(MODE_BADGE_ID)).toBeNull();
  });
});
