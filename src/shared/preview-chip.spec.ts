import { afterEach, describe, expect, it } from "vitest";
import {
  ACTUAL_CHIP_ID,
  ACTUAL_CHIP_LABEL,
  ACTUAL_CHIP_BACKGROUND,
  BASELINE_CHIP_BACKGROUND,
  MODE_BADGE_ID,
  OVERLAY_CHIP_ID,
  OVERLAY_CHIP_LABEL,
  ensureActualChip,
  ensureOverlayChip,
  isPreviewChipVisible,
  positionActualChip,
  positionOverlayChip,
  syncModeBadge,
} from "./preview-chip.js";

afterEach(() => {
  document.getElementById(ACTUAL_CHIP_ID)?.remove();
  document.getElementById(MODE_BADGE_ID)?.remove();
  document.getElementById(OVERLAY_CHIP_ID)?.remove();
  document.querySelectorAll("[id^='visual-delta-demo-chip-']").forEach((el) => {
    el.remove();
  });
});

describe("Actual chip", () => {
  it("attaches non-layout chrome to the captured image host", () => {
    const host = document.createElement("div");
    const actual = document.createElement("img");
    actual.style.left = "12px";
    actual.style.top = "18px";
    actual.style.transform = "translate(4px, 6px)";
    host.appendChild(actual);
    document.body.appendChild(host);

    const chip = ensureActualChip(actual);

    expect(chip?.id).toBe(ACTUAL_CHIP_ID);
    expect(chip?.textContent).toBe(ACTUAL_CHIP_LABEL);
    expect(chip?.parentElement).toBe(host);
    expect(chip?.getAttribute("data-testid")).toBe("actual-image-chip");
    expect(chip?.style.position).toBe("absolute");
    expect(chip?.style.left).toBe("12px");
    expect(chip?.style.top).toBe("18px");
    expect(chip?.style.transform).toBe("translate(4px, 6px)");
    expect(chip?.style.marginLeft).toBe("6px");
    expect(chip?.style.background).toBe(ACTUAL_CHIP_BACKGROUND);
    host.remove();
  });

  it("moves the centered label to the top-right of the shared image origin", () => {
    const host = document.createElement("div");
    const actual = document.createElement("img");
    host.appendChild(actual);
    document.body.appendChild(host);
    const chip = ensureActualChip(actual, { position: false });
    expect(chip).not.toBeNull();
    Object.defineProperty(actual, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 260 }),
    });
    Object.defineProperty(chip, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 48 }),
    });

    positionActualChip(actual, { centered: true, chip: chip ?? undefined });

    expect(chip?.style.marginLeft).toBe("206px");
    host.remove();
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
    expect(chip.style.background).toBe(BASELINE_CHIP_BACKGROUND);
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
