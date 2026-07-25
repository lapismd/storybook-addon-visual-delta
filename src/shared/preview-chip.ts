/**
 * Preview chrome chips: Image-only (fixed) and Baseline (on the overlay).
 * Shared so catalog demos / tests cannot drift from the live overlay paint.
 */

export const MODE_BADGE_ID = "visual-delta-mode-badge";
export const OVERLAY_CHIP_ID = "visual-delta-overlay-chip";
export const OVERLAY_CHIP_LABEL = "Baseline";
export const MODE_BADGE_LABEL = "Image only";

/** Shared paint for Image-only (fixed) and Baseline (on-overlay). */
export const PREVIEW_CHIP_PAINT = `
  z-index: 10000;
  padding: 3px 8px;
  font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  color: #fff;
  background: rgba(2, 97, 198, 0.92);
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
`.trim();

export function paintFixedModeBadge(badge: HTMLElement) {
  badge.style.cssText = `
    position: fixed;
    top: 8px;
    left: 8px;
    ${PREVIEW_CHIP_PAINT}
  `;
}

export function paintOverlayChip(chip: HTMLElement) {
  chip.style.cssText = `
    position: absolute;
    top: 4px;
    left: 4px;
    ${PREVIEW_CHIP_PAINT}
  `;
}

export function syncModeBadge(imageOnly: boolean) {
  let badge = document.getElementById(MODE_BADGE_ID);
  if (!imageOnly) {
    badge?.remove();
    return;
  }
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement("div");
    badge.id = MODE_BADGE_ID;
    badge.textContent = MODE_BADGE_LABEL;
    document.documentElement.appendChild(badge);
  } else if (badge.textContent !== MODE_BADGE_LABEL) {
    badge.textContent = MODE_BADGE_LABEL;
  }
  paintFixedModeBadge(badge);
}

/**
 * Attach a Baseline chip to the overlay root (sibling of the PNG). Absolute so
 * it moves with overlay drag transforms. Opacity / difference blend stay on the
 * `<img>` so the chip stays solid.
 */
export function ensureOverlayChip(
  overlay: HTMLElement,
  options?: { id?: string },
): HTMLElement {
  const id = options?.id ?? OVERLAY_CHIP_ID;
  // Drop any leftover fixed badge from earlier experiments.
  document.getElementById("visual-delta-overlay-badge")?.remove();
  const existing = overlay.querySelector(`:scope > #${CSS.escape(id)}`);
  let chip: HTMLElement;
  if (existing instanceof HTMLElement) {
    chip = existing;
    if (chip.textContent !== OVERLAY_CHIP_LABEL) {
      chip.textContent = OVERLAY_CHIP_LABEL;
    }
  } else {
    const orphan = document.getElementById(id);
    if (orphan && orphan.parentElement !== overlay) {
      orphan.remove();
    }
    chip = document.createElement("div");
    chip.id = id;
    chip.textContent = OVERLAY_CHIP_LABEL;
    chip.setAttribute("data-testid", "baseline-overlay-chip");
    overlay.appendChild(chip);
  }
  if (!chip.hasAttribute("data-testid")) {
    chip.setAttribute("data-testid", "baseline-overlay-chip");
  }
  paintOverlayChip(chip);
  return chip;
}

/** True when the chip occupies space and is not display/visibility/opacity hidden. */
export function isPreviewChipVisible(chip: HTMLElement): boolean {
  const rect = chip.getBoundingClientRect();
  const style = getComputedStyle(chip);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}
