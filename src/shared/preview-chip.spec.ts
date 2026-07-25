import { afterEach, describe, expect, it } from "vitest";
import {
  MODE_BADGE_ID,
  MODE_BADGE_LABEL,
  OVERLAY_CHIP_ID,
  OVERLAY_CHIP_LABEL,
  ensureOverlayChip,
  isPreviewChipVisible,
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

    const chip = ensureOverlayChip(overlay, { id: "visual-delta-demo-chip-left" });
    expect(chip.id).toBe("visual-delta-demo-chip-left");
    expect(chip.textContent).toBe(OVERLAY_CHIP_LABEL);
    overlay.remove();
  });
});

describe("syncModeBadge", () => {
  it("shows Image only when live is hidden and removes it otherwise", () => {
    syncModeBadge(true);
    const badge = document.getElementById(MODE_BADGE_ID);
    expect(badge?.textContent).toBe(MODE_BADGE_LABEL);
    expect(badge?.style.position).toBe("fixed");

    syncModeBadge(false);
    expect(document.getElementById(MODE_BADGE_ID)).toBeNull();
  });
});
