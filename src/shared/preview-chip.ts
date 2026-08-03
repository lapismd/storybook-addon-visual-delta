/**
 * Preview chrome for Baseline and Actual comparison images.
 * Shared so catalog demos / tests cannot drift from the live overlay paint.
 */

export const MODE_BADGE_ID = "visual-delta-mode-badge";
export const OVERLAY_CHIP_ID = "visual-delta-overlay-chip";
export const OVERLAY_CHIP_LABEL = "Baseline";
export const ACTUAL_CHIP_ID = "visual-delta-actual-chip";
export const ACTUAL_CHIP_LABEL = "Actual";
export const BASELINE_CHIP_GAP_PX = 6;
export const BASELINE_CHIP_BACKGROUND = "rgba(17, 119, 57, 0.94)";
export const ACTUAL_CHIP_BACKGROUND = "rgba(2, 97, 198, 0.92)";

/** Shared structural paint for comparison labels. */
export const PREVIEW_CHIP_PAINT = `
  z-index: 10000;
  padding: 3px 8px;
  font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  color: #fff;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
`.trim();

export function paintOverlayChip(
  chip: HTMLElement,
  offset: { x: number; y: number } = { x: 0, y: 0 },
) {
  chip.style.cssText = `
    position: absolute;
    top: ${BASELINE_CHIP_GAP_PX + offset.y}px;
    left: ${BASELINE_CHIP_GAP_PX + offset.x}px;
    ${PREVIEW_CHIP_PAINT}
    background: ${BASELINE_CHIP_BACKGROUND};
  `;
}

function paintActualChip(chip: HTMLElement, actualImage: HTMLImageElement) {
  chip.style.cssText = `
    position: absolute;
    top: ${actualImage.style.top || "0px"};
    left: ${actualImage.style.left || "0px"};
    margin-top: ${BASELINE_CHIP_GAP_PX}px;
    transform: ${actualImage.style.transform || "none"};
    transform-origin: top left;
    visibility: hidden;
    ${PREVIEW_CHIP_PAINT}
    background: ${ACTUAL_CHIP_BACKGROUND};
  `;
}

/**
 * Keep an Actual chip attached to the captured bitmap without wrapping it or
 * contributing layout. Split panes use the same top-left inset as Baseline;
 * centered comparisons place Actual at the top-right so both labels remain
 * legible over the shared image origin.
 */
export function positionActualChip(
  actualImage: HTMLImageElement,
  options?: { centered?: boolean; chip?: HTMLElement },
): HTMLElement | null {
  const chip =
    options?.chip ??
    ensureActualChip(actualImage, {
      centered: options?.centered,
      position: false,
    });
  if (!chip) return null;
  paintActualChip(chip, actualImage);
  const imageWidth = actualImage.getBoundingClientRect().width;
  const chipWidth = chip.getBoundingClientRect().width;
  chip.style.marginLeft = `${
    options?.centered
      ? Math.max(
          BASELINE_CHIP_GAP_PX,
          imageWidth - chipWidth - BASELINE_CHIP_GAP_PX,
        )
      : BASELINE_CHIP_GAP_PX
  }px`;
  return chip;
}

export function ensureActualChip(
  actualImage: HTMLImageElement,
  options?: { centered?: boolean; position?: boolean },
): HTMLElement | null {
  const parent = actualImage.parentElement;
  if (!parent) return null;
  const document = actualImage.ownerDocument;
  let chip = document.getElementById(ACTUAL_CHIP_ID);
  if (!chip) {
    chip = document.createElement("div");
    chip.id = ACTUAL_CHIP_ID;
  }
  if (chip.parentElement !== parent) parent.appendChild(chip);
  chip.textContent = ACTUAL_CHIP_LABEL;
  chip.setAttribute("data-testid", "actual-image-chip");
  paintActualChip(chip, actualImage);
  if (options?.position !== false) {
    positionActualChip(actualImage, {
      centered: options?.centered,
      chip,
    });
  }
  return chip;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Keep the chip over the bitmap while clamping it into the visible pane.
 * Only the chip moves; the image and live/baseline alignment remain untouched.
 */
export function positionOverlayChip(
  overlay: HTMLElement,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): HTMLElement {
  const chip = ensureOverlayChip(overlay, { offset, position: false });
  const parent = overlay.parentElement;
  const chipRect = chip.getBoundingClientRect();
  if (!parent || chipRect.width <= 0 || chipRect.height <= 0) {
    paintOverlayChip(chip, offset);
    return chip;
  }
  const parentRect = parent.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const desiredX = BASELINE_CHIP_GAP_PX + offset.x;
  const desiredY = BASELINE_CHIP_GAP_PX + offset.y;
  const minX = parentRect.left - overlayRect.left;
  const maxX = parentRect.right - overlayRect.left - chipRect.width;
  const minY = parentRect.top - overlayRect.top;
  const maxY = parentRect.bottom - overlayRect.top - chipRect.height;
  paintOverlayChip(chip);
  chip.style.left = `${clamp(desiredX, minX, maxX)}px`;
  chip.style.top = `${clamp(desiredY, minY, maxY)}px`;
  return chip;
}

export function syncModeBadge(_imageOnly: boolean) {
  // Image-only mode retains the Baseline overlay chip. Remove a leftover fixed
  // mode badge from older addon builds instead of duplicating visible state.
  document.getElementById(MODE_BADGE_ID)?.remove();
}

/**
 * Attach a Baseline chip to the overlay root (sibling of the PNG). Absolute so
 * it moves with overlay drag transforms. Opacity / difference blend stay on the
 * `<img>` so the chip stays solid.
 */
export function ensureOverlayChip(
  overlay: HTMLElement,
  options?: {
    id?: string;
    offset?: { x: number; y: number };
    position?: boolean;
  },
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
  paintOverlayChip(chip, options?.offset);
  if (options?.position !== false) {
    requestAnimationFrame(() => {
      if (chip.isConnected) {
        positionOverlayChip(overlay, options?.offset);
      }
    });
  }
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
