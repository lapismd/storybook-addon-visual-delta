import { addons, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_PLACEMENT,
  EVENTS,
  VISUAL_COMPARE_PANE_PAD_PX,
  deviceScaleFactorForImage,
  isSplitPlacement,
  normalizePlacement,
  type PlacementMode,
  type VisualDeltaImage,
  type VisualDeltaParams,
} from "../constants.js";
import {
  baselinePanePaddingPx,
  canvasCompareInsetsPx,
} from "../shared/compare-insets.js";
import {
  baselineCompareSizesFromNatural,
  sharedScrollExtentSize,
  type BaselineCompareSizes,
} from "../shared/compare-viewport.js";
import { resolvePaintedBackground } from "../shared/preview-background.js";

const OVERLAY_ID = "visual-delta-overlay";
const SPLIT_ID = "visual-delta-split";
const PANES_WRAP_ID = "visual-delta-panes";
const LIVE_PANE_ID = "visual-delta-live-pane";
const BASELINE_PANE_ID = "visual-delta-baseline-pane";
const SCROLL_RAIL_V_ID = "visual-delta-scroll-rail-v";
const SCROLL_SPACER_V_ID = "visual-delta-scroll-spacer-v";
const SCROLL_RAIL_H_ID = "visual-delta-scroll-rail-h";
const SCROLL_SPACER_H_ID = "visual-delta-scroll-spacer-h";
const SCROLL_CORNER_ID = "visual-delta-scroll-corner";
/** Invisible box that forces equal scrollWidth/scrollHeight on both panes. */
const SCROLL_EXTENT_ATTR = "data-visual-delta-scroll-extent";
const RAIL_THICKNESS_PX = 12;

/**
 * Prefer the live `#storybook-root` over a decorator-closed `canvasElement`.
 * After FORCE_REMOUNT / GOTO the closed-over node can be detached while
 * SELECT_IMAGE is still delivered to a handler that early-returns.
 */
function resolveStoryCanvas(fallback?: HTMLElement | null): HTMLElement | null {
  const root = document.getElementById("storybook-root");
  if (root instanceof HTMLElement && root.isConnected && root.parentElement) {
    return root;
  }
  if (
    fallback instanceof HTMLElement &&
    fallback.isConnected &&
    fallback.parentElement
  ) {
    return fallback;
  }
  return null;
}

/** Device-scale PNGs display at CSS size so they match the live subject. */
function sizeOverlayImageToCss(
  img: HTMLImageElement,
  imageItem: VisualDeltaImage,
) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const scale = deviceScaleFactorForImage(imageItem);
  img.style.width = `${img.naturalWidth / scale}px`;
  img.style.height = `${img.naturalHeight / scale}px`;
}

let dragCleanupRef: (() => void) | null = null;
let layoutObserverRef: ResizeObserver | null = null;
let sharedScrollCleanupRef: (() => void) | null = null;
let sharedScrollRefreshRef: (() => void) | null = null;
let liveContentWidthRestoreRef: (() => void) | null = null;
let liveCanvasSplitRestoreRef: (() => void) | null = null;
let lastCompareSizes: BaselineCompareSizes | null = null;
let lastSelection: {
  index: number;
  images: VisualDeltaImage[];
} | null = null;
let currentPlacement: PlacementMode = DEFAULT_PLACEMENT;
/** False = image-only: hide live story, show baseline PNG (center + drag). */
let currentLiveVisible = true;
let currentOpacity = 0.5;
let currentColorInversion = false;
/** Survives FORCE_REMOUNT — decorator useChannel does not. */
let overlayChannelInstalled = false;

const MODE_BADGE_ID = "visual-delta-mode-badge";

function syncModeBadge(imageOnly: boolean) {
  let badge = document.getElementById(MODE_BADGE_ID);
  if (!imageOnly) {
    badge?.remove();
    return;
  }
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement("div");
    badge.id = MODE_BADGE_ID;
    badge.textContent = "Image only";
    document.documentElement.appendChild(badge);
  }
  badge.style.cssText = `
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 10000;
    padding: 3px 8px;
    font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif;
    color: #fff;
    background: rgba(2, 97, 198, 0.92);
    border-radius: 4px;
    pointer-events: none;
    user-select: none;
  `;
}

function applyLiveVisibility(canvasElement: HTMLElement) {
  const imageOnly = !currentLiveVisible;
  canvasElement.style.visibility = imageOnly ? "hidden" : "";
  syncModeBadge(imageOnly);
}

function getCanvasScale(element: Element): number {
  const bodyStyle = window.getComputedStyle(document.body);
  const bodyTransform = bodyStyle.transform;
  if (bodyTransform && bodyTransform !== "none") {
    try {
      const matrix = new DOMMatrix(bodyTransform);
      if (matrix.a !== 1 || matrix.d !== 1) {
        return matrix.a || matrix.d || 1;
      }
    } catch {
      /* ignore */
    }
  }
  const bodyInlineTransform = document.body.style.transform;
  if (bodyInlineTransform && bodyInlineTransform !== "none") {
    try {
      const matrix = new DOMMatrix(bodyInlineTransform);
      if (matrix.a !== 1 || matrix.d !== 1) {
        return matrix.a || matrix.d || 1;
      }
    } catch {
      /* ignore */
    }
  }
  let current = element.parentElement;
  while (current && current !== document.body) {
    const computedStyle = window.getComputedStyle(current);
    const transform = computedStyle.transform;
    if (transform && transform !== "none") {
      try {
        const matrix = new DOMMatrix(transform);
        if (matrix.a !== 1 || matrix.d !== 1) {
          return matrix.a || matrix.d || 1;
        }
      } catch {
        /* ignore */
      }
    }
    current = current.parentElement;
  }
  return 1;
}

function setupDragOverlay(overlay: HTMLElement): () => void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  let parentElement: HTMLElement | null = null;

  const getCurrentTransform = () => {
    const transform = overlay.style.transform || "";
    const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      return {
        x: Number.isNaN(x) ? 0 : x,
        y: Number.isNaN(y) ? 0 : y,
      };
    }
    return { x: 0, y: 0 };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (currentPlacement !== "center") return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    parentElement = overlay.parentElement;
    if (!parentElement) return;
    const currentTransform = getCurrentTransform();
    translateX = currentTransform.x;
    translateY = currentTransform.y;
    overlay.style.cursor = "grabbing";
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !parentElement) return;
    const scale = getCanvasScale(overlay);
    const deltaX = (e.clientX - startX) / scale;
    const deltaY = (e.clientY - startY) / scale;
    overlay.style.transform = `translate(${translateX + deltaX}px, ${translateY + deltaY}px)`;
  };

  const handleMouseUp = () => {
    isDragging = false;
    overlay.style.cursor = currentPlacement === "center" ? "grab" : "default";
  };

  overlay.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  return () => {
    overlay.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };
}

function resolveSubjectRect(canvasElement: HTMLElement): DOMRect {
  const child = canvasElement.querySelector(":scope > *");
  if (child instanceof HTMLElement) {
    return child.getBoundingClientRect();
  }
  return canvasElement.getBoundingClientRect();
}

function paneStyleBase(): string {
  return `
    flex: 0 0 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    position: relative;
    box-sizing: border-box;
    scrollbar-width: none;
  `;
}

/**
 * Baselines are component-clipped (no canvas chrome). Mirror `#storybook-root`
 * padding **plus** the story subject's margins onto the baseline pane so the
 * PNG lines up with the live subject (e.g. `my-2` on a full-width control).
 */
function syncBaselinePaneInset(
  canvasElement: HTMLElement,
  baselinePane: HTMLElement,
) {
  const style = getComputedStyle(canvasElement);
  const subject = canvasElement.querySelector(":scope > *");
  const subjectStyle =
    subject instanceof Element ? getComputedStyle(subject) : null;
  const pad = baselinePanePaddingPx(style, subjectStyle);

  baselinePane.style.paddingTop = `${pad.top}px`;
  baselinePane.style.paddingRight = `${pad.right}px`;
  baselinePane.style.paddingBottom = `${pad.bottom}px`;
  baselinePane.style.paddingLeft = `${pad.left}px`;
  baselinePane.style.borderTopWidth = style.borderTopWidth;
  baselinePane.style.borderRightWidth = style.borderRightWidth;
  baselinePane.style.borderBottomWidth = style.borderBottomWidth;
  baselinePane.style.borderLeftWidth = style.borderLeftWidth;
  baselinePane.style.borderStyle = "solid";
  baselinePane.style.borderColor = "transparent";
}

/**
 * Lock the story subject to the baseline CSS width so split and center overlay
 * do not reflow/wrap differently from the Playwright clip.
 */
function lockLiveContentWidth(
  canvasElement: HTMLElement,
  contentWidth: number,
) {
  liveContentWidthRestoreRef?.();
  liveContentWidthRestoreRef = null;
  const subject = canvasElement.querySelector(":scope > *");
  if (!(subject instanceof HTMLElement) || contentWidth < 1) return;
  const prev = {
    width: subject.style.width,
    maxWidth: subject.style.maxWidth,
    minWidth: subject.style.minWidth,
    boxSizing: subject.style.boxSizing,
  };
  subject.style.boxSizing = "border-box";
  subject.style.width = `${contentWidth}px`;
  subject.style.maxWidth = `${contentWidth}px`;
  subject.style.minWidth = `${contentWidth}px`;
  liveContentWidthRestoreRef = () => {
    subject.style.width = prev.width;
    subject.style.maxWidth = prev.maxWidth;
    subject.style.minWidth = prev.minWidth;
    subject.style.boxSizing = prev.boxSizing;
    liveContentWidthRestoreRef = null;
  };
}

function unlockLiveContentWidth() {
  liveContentWidthRestoreRef?.();
  liveContentWidthRestoreRef = null;
}

function measureCanvasInsets(canvasElement: HTMLElement): {
  x: number;
  y: number;
} {
  const style = getComputedStyle(canvasElement);
  const subject = canvasElement.querySelector(":scope > *");
  const subjectStyle =
    subject instanceof Element ? getComputedStyle(subject) : null;
  return canvasCompareInsetsPx(style, subjectStyle);
}

/**
 * `#storybook-root` uses `min-height: 100vh`, which forces tall scrollable
 * content inside short compare panes. Collapse that while split is active.
 */
function lockLiveCanvasForSplit(canvasElement: HTMLElement) {
  liveCanvasSplitRestoreRef?.();
  const prev = {
    minHeight: canvasElement.style.minHeight,
    height: canvasElement.style.height,
  };
  canvasElement.style.minHeight = "0";
  canvasElement.style.height = "auto";
  liveCanvasSplitRestoreRef = () => {
    canvasElement.style.minHeight = prev.minHeight;
    canvasElement.style.height = prev.height;
    liveCanvasSplitRestoreRef = null;
  };
}

function unlockLiveCanvasForSplit() {
  liveCanvasSplitRestoreRef?.();
  liveCanvasSplitRestoreRef = null;
}

const HIDE_PANE_SCROLLBAR_STYLE_ID = "visual-delta-hide-pane-scrollbars";

function ensurePaneScrollbarStyles() {
  if (document.getElementById(HIDE_PANE_SCROLLBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_PANE_SCROLLBAR_STYLE_ID;
  style.textContent = `
    #${LIVE_PANE_ID},
    #${BASELINE_PANE_ID} {
      scrollbar-width: none;
    }
    #${LIVE_PANE_ID}::-webkit-scrollbar,
    #${BASELINE_PANE_ID}::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  `;
  document.head.appendChild(style);
}

function unbindSharedScroll() {
  sharedScrollCleanupRef?.();
  sharedScrollCleanupRef = null;
  sharedScrollRefreshRef = null;
}

function getOrCreateScrollExtent(pane: HTMLElement): HTMLElement {
  for (const child of pane.children) {
    if (
      child instanceof HTMLElement &&
      child.hasAttribute(SCROLL_EXTENT_ATTR)
    ) {
      return child;
    }
  }
  const el = document.createElement("div");
  el.setAttribute(SCROLL_EXTENT_ATTR, "");
  el.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;z-index:0;";
  pane.appendChild(el);
  return el;
}

/**
 * Natural scrollable size of a pane ignoring the equalizing extent shim.
 */
function measurePaneScrollSize(pane: HTMLElement): {
  width: number;
  height: number;
} {
  const extent = getOrCreateScrollExtent(pane);
  const prevWidth = extent.style.width;
  const prevHeight = extent.style.height;
  extent.style.width = "0px";
  extent.style.height = "0px";
  const width = pane.scrollWidth;
  const height = pane.scrollHeight;
  extent.style.width = prevWidth;
  extent.style.height = prevHeight;
  return { width, height };
}

/**
 * Force both panes to the same scrollWidth/scrollHeight (max of either side,
 * at least the baseline CSS content box). Stops the shorter/narrower side from
 * clamping shared scroll before you can reach the larger content.
 */
function equalizePaneScrollExtents(
  livePane: HTMLElement,
  baselinePane: HTMLElement,
) {
  const live = measurePaneScrollSize(livePane);
  const baseline = measurePaneScrollSize(baselinePane);
  const target = sharedScrollExtentSize(
    live,
    baseline,
    lastCompareSizes?.content,
  );
  for (const pane of [livePane, baselinePane]) {
    const extent = getOrCreateScrollExtent(pane);
    extent.style.width = `${target.width}px`;
    extent.style.height = `${target.height}px`;
  }
  return target;
}

/**
 * Vertical + horizontal rails drive both panes. Pane scrollbars stay hidden.
 * Pane `scroll` events are mirrored with a re-entrancy lock so touch / trackpad
 * gestures stay synchronized on both axes.
 */
function bindSharedScrollRails(
  split: HTMLElement,
  livePane: HTMLElement,
  baselinePane: HTMLElement,
  vRail: HTMLElement,
  vSpacer: HTMLElement,
  hRail: HTMLElement,
  hSpacer: HTMLElement,
) {
  unbindSharedScroll();
  let syncing = false;
  let syncGeneration = 0;
  let desiredTop = 0;
  let desiredLeft = 0;

  const applyScroll = (top: number, left: number) => {
    desiredTop = top;
    desiredLeft = left;
    syncing = true;
    const generation = ++syncGeneration;
    livePane.scrollTop = top;
    livePane.scrollLeft = left;
    baselinePane.scrollTop = top;
    baselinePane.scrollLeft = left;
    if (vRail.style.display !== "none" && vRail.scrollTop !== top) {
      vRail.scrollTop = top;
    }
    if (hRail.style.display !== "none" && hRail.scrollLeft !== left) {
      hRail.scrollLeft = left;
    }
    // A clamped pane can emit a late `scroll` after we clear syncing; re-assert
    // the desired position on the next frame so the larger side stays reachable.
    requestAnimationFrame(() => {
      if (generation !== syncGeneration) return;
      livePane.scrollTop = desiredTop;
      livePane.scrollLeft = desiredLeft;
      baselinePane.scrollTop = desiredTop;
      baselinePane.scrollLeft = desiredLeft;
      if (vRail.style.display !== "none") vRail.scrollTop = desiredTop;
      if (hRail.style.display !== "none") hRail.scrollLeft = desiredLeft;
      syncing = false;
    });
  };

  const clientWidth = () =>
    Math.min(livePane.clientWidth, baselinePane.clientWidth) ||
    livePane.clientWidth ||
    baselinePane.clientWidth;
  const clientHeight = () =>
    Math.min(livePane.clientHeight, baselinePane.clientHeight) ||
    livePane.clientHeight ||
    baselinePane.clientHeight;

  const refreshSpacers = () => {
    const extent = equalizePaneScrollExtents(livePane, baselinePane);
    const maxScrollHeight = Math.max(
      extent.height,
      livePane.scrollHeight,
      baselinePane.scrollHeight,
    );
    const maxScrollWidth = Math.max(
      extent.width,
      livePane.scrollWidth,
      baselinePane.scrollWidth,
    );
    const ch = clientHeight();
    const cw = clientWidth();
    const overflowY = maxScrollHeight > ch + 1;
    const overflowX = maxScrollWidth > cw + 1;

    vSpacer.style.height = `${maxScrollHeight}px`;
    vSpacer.style.width = "1px";
    hSpacer.style.width = `${maxScrollWidth}px`;
    hSpacer.style.height = "1px";

    vRail.style.display = overflowY ? "" : "none";
    hRail.style.display = overflowX ? "" : "none";
    const corner = document.getElementById(SCROLL_CORNER_ID);
    if (corner instanceof HTMLElement) {
      corner.style.display = overflowX && overflowY ? "" : "none";
    }

    // When only one rail shows, reclaim the grid track.
    split.style.gridTemplateColumns = overflowY
      ? `1fr ${RAIL_THICKNESS_PX}px`
      : "1fr 0px";
    split.style.gridTemplateRows = overflowX
      ? `1fr ${RAIL_THICKNESS_PX}px`
      : "1fr 0px";

    if (overflowY && vRail.scrollTop !== desiredTop) {
      vRail.scrollTop = desiredTop;
    }
    if (overflowX && hRail.scrollLeft !== desiredLeft) {
      hRail.scrollLeft = desiredLeft;
    }

    // Keep panes on the shared position after extent changes.
    if (
      livePane.scrollTop !== desiredTop ||
      livePane.scrollLeft !== desiredLeft ||
      baselinePane.scrollTop !== desiredTop ||
      baselinePane.scrollLeft !== desiredLeft
    ) {
      applyScroll(desiredTop, desiredLeft);
    }
  };

  const onVRailScroll = () => {
    if (syncing) return;
    applyScroll(vRail.scrollTop, desiredLeft);
  };
  const onHRailScroll = () => {
    if (syncing) return;
    applyScroll(desiredTop, hRail.scrollLeft);
  };

  const onPaneScroll = (source: HTMLElement) => {
    if (syncing) return;
    applyScroll(source.scrollTop, source.scrollLeft);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const maxTop = Math.max(
      0,
      Math.max(livePane.scrollHeight, baselinePane.scrollHeight) -
        clientHeight(),
    );
    const maxLeft = Math.max(
      0,
      Math.max(livePane.scrollWidth, baselinePane.scrollWidth) - clientWidth(),
    );
    const deltaX =
      event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const deltaY = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    const nextTop = Math.max(0, Math.min(maxTop, desiredTop + deltaY));
    const nextLeft = Math.max(0, Math.min(maxLeft, desiredLeft + deltaX));
    applyScroll(nextTop, nextLeft);
  };

  const onLiveScroll = () => onPaneScroll(livePane);
  const onBaselineScroll = () => onPaneScroll(baselinePane);

  vRail.addEventListener("scroll", onVRailScroll, { passive: true });
  hRail.addEventListener("scroll", onHRailScroll, { passive: true });
  livePane.addEventListener("scroll", onLiveScroll, { passive: true });
  baselinePane.addEventListener("scroll", onBaselineScroll, { passive: true });
  split.addEventListener("wheel", onWheel, { passive: false });

  const ro = new ResizeObserver(() => refreshSpacers());
  ro.observe(livePane);
  ro.observe(baselinePane);
  const liveChild = livePane.querySelector(":scope > *");
  const baselineChild = baselinePane.querySelector(":scope > *");
  if (liveChild instanceof HTMLElement) ro.observe(liveChild);
  if (baselineChild instanceof HTMLElement) ro.observe(baselineChild);
  refreshSpacers();

  sharedScrollRefreshRef = refreshSpacers;
  sharedScrollCleanupRef = () => {
    syncGeneration += 1;
    vRail.removeEventListener("scroll", onVRailScroll);
    hRail.removeEventListener("scroll", onHRailScroll);
    livePane.removeEventListener("scroll", onLiveScroll);
    baselinePane.removeEventListener("scroll", onBaselineScroll);
    split.removeEventListener("wheel", onWheel);
    ro.disconnect();
    for (const pane of [livePane, baselinePane]) {
      for (const child of Array.from(pane.children)) {
        if (
          child instanceof HTMLElement &&
          child.hasAttribute(SCROLL_EXTENT_ATTR)
        ) {
          child.remove();
        }
      }
    }
    sharedScrollRefreshRef = null;
  };
}

function teardownSplit(canvasElement: HTMLElement) {
  unbindSharedScroll();
  unlockLiveContentWidth();
  unlockLiveCanvasForSplit();
  lastCompareSizes = null;
  const split = document.getElementById(SPLIT_ID);
  if (!(split instanceof HTMLElement)) return;
  const host = split.parentElement;
  if (!host) return;
  if (canvasElement.parentElement === document.getElementById(LIVE_PANE_ID)) {
    host.insertBefore(canvasElement, split);
  }
  split.remove();
  applyLiveVisibility(canvasElement);
}

/**
 * Size both panes equally for compare:
 * - Free axis fills the host (left/right → full height; above/below → full width)
 *   so unused preview space is used instead of short panes + scroll rails.
 * - Constrained axis fits baseline CSS content plus canvas insets (storybook-root
 *   padding), not only the small compare pad — otherwise padding forces scroll.
 */
function applyEqualPaneViewports(
  canvasElement: HTMLElement,
  livePane: HTMLElement,
  baselinePane: HTMLElement,
  panesWrap: HTMLElement,
  placement: PlacementMode,
  sizes: BaselineCompareSizes,
) {
  lastCompareSizes = sizes;
  const split = document.getElementById(SPLIT_ID);
  const hostEl =
    (split instanceof HTMLElement ? split.parentElement : null) ??
    canvasElement.parentElement;
  const horizontal = placement === "left" || placement === "right";
  const availW = Math.max(
    0,
    (hostEl?.clientWidth ?? sizes.viewport.width * 2) - RAIL_THICKNESS_PX,
  );
  const availH = Math.max(
    0,
    (hostEl?.clientHeight ?? sizes.viewport.height * 2) - RAIL_THICKNESS_PX,
  );
  const insets = measureCanvasInsets(canvasElement);
  const minPaneW = Math.ceil(
    sizes.content.width + Math.max(VISUAL_COMPARE_PANE_PAD_PX * 2, insets.x),
  );
  const minPaneH = Math.ceil(
    sizes.content.height + Math.max(VISUAL_COMPARE_PANE_PAD_PX * 2, insets.y),
  );

  let paneW: number;
  let paneH: number;
  if (horizontal) {
    paneW = Math.min(
      Math.max(minPaneW, sizes.viewport.width),
      Math.max(1, Math.floor((availW - 1) / 2)),
    );
    // Use the iframe height — short baseline-sized panes left empty space below
    // while `#storybook-root { min-height: 100vh }` still scrolled inside.
    paneH = Math.max(1, availH);
  } else {
    paneW = Math.max(1, availW);
    paneH = Math.min(
      Math.max(minPaneH, sizes.viewport.height),
      Math.max(1, Math.floor((availH - 1) / 2)),
    );
  }

  for (const pane of [livePane, baselinePane]) {
    pane.style.width = `${paneW}px`;
    pane.style.height = `${paneH}px`;
    pane.style.flex = "0 0 auto";
  }

  panesWrap.style.width = horizontal ? `${paneW * 2 + 1}px` : `${paneW}px`;
  panesWrap.style.height = horizontal ? `${paneH}px` : `${paneH * 2 + 1}px`;

  lockLiveCanvasForSplit(canvasElement);
  lockLiveContentWidth(canvasElement, sizes.content.width);
  syncBaselinePaneInset(canvasElement, baselinePane);
  sharedScrollRefreshRef?.();
}

function ensureSplit(
  canvasElement: HTMLElement,
  placement: PlacementMode,
  sizes?: BaselineCompareSizes | null,
): { livePane: HTMLElement; baselinePane: HTMLElement } {
  const host = canvasElement.parentElement;
  if (!host) {
    throw new Error("Visual Delta: canvas has no parent");
  }

  let split = document.getElementById(SPLIT_ID);
  let panesWrap = document.getElementById(PANES_WRAP_ID);
  let livePane = document.getElementById(LIVE_PANE_ID);
  let baselinePane = document.getElementById(BASELINE_PANE_ID);
  let vRail = document.getElementById(SCROLL_RAIL_V_ID);
  let vSpacer = document.getElementById(SCROLL_SPACER_V_ID);
  let hRail = document.getElementById(SCROLL_RAIL_H_ID);
  let hSpacer = document.getElementById(SCROLL_SPACER_H_ID);
  let corner = document.getElementById(SCROLL_CORNER_ID);

  const needsBuild =
    !(split instanceof HTMLElement) ||
    !(panesWrap instanceof HTMLElement) ||
    !(livePane instanceof HTMLElement) ||
    !(baselinePane instanceof HTMLElement) ||
    !(vRail instanceof HTMLElement) ||
    !(vSpacer instanceof HTMLElement) ||
    !(hRail instanceof HTMLElement) ||
    !(hSpacer instanceof HTMLElement) ||
    !(corner instanceof HTMLElement);

  if (needsBuild) {
    unbindSharedScroll();
    split?.remove();
    split = document.createElement("div");
    split.id = SPLIT_ID;
    panesWrap = document.createElement("div");
    panesWrap.id = PANES_WRAP_ID;
    livePane = document.createElement("div");
    livePane.id = LIVE_PANE_ID;
    baselinePane = document.createElement("div");
    baselinePane.id = BASELINE_PANE_ID;
    vRail = document.createElement("div");
    vRail.id = SCROLL_RAIL_V_ID;
    vSpacer = document.createElement("div");
    vSpacer.id = SCROLL_SPACER_V_ID;
    hRail = document.createElement("div");
    hRail.id = SCROLL_RAIL_H_ID;
    hSpacer = document.createElement("div");
    hSpacer.id = SCROLL_SPACER_H_ID;
    corner = document.createElement("div");
    corner.id = SCROLL_CORNER_ID;
    host.style.position = "relative";
    host.insertBefore(split, canvasElement);
    livePane.appendChild(canvasElement);
    panesWrap.appendChild(livePane);
    panesWrap.appendChild(baselinePane);
    vRail.appendChild(vSpacer);
    hRail.appendChild(hSpacer);
    split.appendChild(panesWrap);
    split.appendChild(vRail);
    split.appendChild(hRail);
    split.appendChild(corner);
  }

  if (
    !(split instanceof HTMLElement) ||
    !(panesWrap instanceof HTMLElement) ||
    !(livePane instanceof HTMLElement) ||
    !(baselinePane instanceof HTMLElement) ||
    !(vRail instanceof HTMLElement) ||
    !(vSpacer instanceof HTMLElement) ||
    !(hRail instanceof HTMLElement) ||
    !(hSpacer instanceof HTMLElement) ||
    !(corner instanceof HTMLElement)
  ) {
    throw new Error("Visual Delta: split chrome missing");
  }

  ensurePaneScrollbarStyles();

  const horizontal = placement === "left" || placement === "right";
  const paneBackground = resolvePaintedBackground(document, canvasElement);
  host.style.minHeight = "100vh";
  split.style.cssText = `
    display: grid;
    grid-template-columns: 1fr ${RAIL_THICKNESS_PX}px;
    grid-template-rows: 1fr ${RAIL_THICKNESS_PX}px;
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    background: ${paneBackground};
  `;
  panesWrap.style.cssText = `
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: ${horizontal ? "row" : "column"};
    align-items: flex-start;
    justify-content: flex-start;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    gap: 1px;
    background: rgba(0, 0, 0, 0.12);
  `;
  vRail.style.cssText = `
    grid-column: 2;
    grid-row: 1;
    overflow-y: scroll;
    overflow-x: hidden;
    background: ${paneBackground};
  `;
  hRail.style.cssText = `
    grid-column: 1;
    grid-row: 2;
    overflow-x: scroll;
    overflow-y: hidden;
    background: ${paneBackground};
  `;
  corner.style.cssText = `
    grid-column: 2;
    grid-row: 2;
    background: ${paneBackground};
  `;
  vSpacer.style.cssText = `width: 1px; height: 1px;`;
  hSpacer.style.cssText = `width: 1px; height: 1px;`;

  livePane.style.cssText = `${paneStyleBase()} background: ${paneBackground};`;
  baselinePane.style.cssText = `${paneStyleBase()} background: ${paneBackground};`;
  livePane.style.padding = "0";
  syncBaselinePaneInset(canvasElement, baselinePane);

  const baselineFirst = placement === "left" || placement === "above";
  const first = baselineFirst ? baselinePane : livePane;
  const second = baselineFirst ? livePane : baselinePane;
  if (panesWrap.firstElementChild !== first) {
    panesWrap.appendChild(first);
    panesWrap.appendChild(second);
  }

  const compareSizes = sizes ?? lastCompareSizes;
  if (compareSizes) {
    applyEqualPaneViewports(
      canvasElement,
      livePane,
      baselinePane,
      panesWrap,
      placement,
      compareSizes,
    );
  }

  if (needsBuild || !sharedScrollCleanupRef) {
    bindSharedScrollRails(
      split,
      livePane,
      baselinePane,
      vRail,
      vSpacer,
      hRail,
      hSpacer,
    );
  } else {
    sharedScrollRefreshRef?.();
  }
  return { livePane, baselinePane };
}

function ensureOverlayElement(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay instanceof HTMLElement) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  const img = document.createElement("img");
  img.style.cssText = `
    display: block;
    width: auto;
    height: auto;
    max-width: none;
    max-height: none;
    pointer-events: none;
    user-select: none;
  `;
  overlay.appendChild(img);
  dragCleanupRef = setupDragOverlay(overlay);
  return overlay;
}

function styleOverlayForMode(overlay: HTMLElement, placement: PlacementMode) {
  if (isSplitPlacement(placement)) {
    overlay.style.cssText = `
      position: relative;
      top: auto;
      left: auto;
      width: max-content;
      height: max-content;
      pointer-events: none;
      z-index: 1;
      opacity: 1;
      cursor: default;
      transform: none;
      mix-blend-mode: normal;
    `;
  } else {
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: max-content;
      height: max-content;
      pointer-events: auto;
      z-index: 9999;
      opacity: 1;
      cursor: grab;
      transform: translate(0px, 0px);
    `;
  }
}

function effectivePlacement(imageItem: VisualDeltaImage): PlacementMode {
  return normalizePlacement(
    imageItem.placement ?? currentPlacement ?? DEFAULT_PLACEMENT,
  );
}

function updateOverlayStyle(overlay: HTMLElement | null) {
  if (!overlay) return;
  if (isSplitPlacement(currentPlacement)) {
    overlay.style.mixBlendMode = "normal";
    overlay.style.opacity = "1";
  } else {
    overlay.style.mixBlendMode = currentColorInversion
      ? "difference"
      : "normal";
    overlay.style.opacity = String(currentOpacity);
  }
}

function calculateCenterPosition(
  imageItem: VisualDeltaImage,
  canvasParent: HTMLElement,
  canvasElement: HTMLElement,
) {
  let x = imageItem.offsetX ?? 0;
  let y = imageItem.offsetY ?? 0;
  const scale = getCanvasScale(canvasParent);
  const parentRect = canvasParent.getBoundingClientRect();

  if (imageItem.align === "canvas") {
    const subjectRect = resolveSubjectRect(canvasElement);
    x += (subjectRect.left - parentRect.left) / scale;
    y += (subjectRect.top - parentRect.top) / scale;
    return { x, y };
  }

  if (imageItem.anchor) {
    const anchorElement = document.querySelector(imageItem.anchor);
    if (anchorElement) {
      const anchorRect = anchorElement.getBoundingClientRect();
      x += (anchorRect.left - parentRect.left) / scale;
      y += (anchorRect.top - parentRect.top) / scale;
    }
  } else if (imageItem.align === "viewport") {
    x += -parentRect.left / scale;
    y += -parentRect.top / scale;
  } else {
    const subjectRect = resolveSubjectRect(canvasElement);
    x += (subjectRect.left - parentRect.left) / scale;
    y += (subjectRect.top - parentRect.top) / scale;
  }
  return { x, y };
}

function applyOverlayPosition(
  overlay: HTMLElement,
  imageItem: VisualDeltaImage,
  sizes?: BaselineCompareSizes | null,
) {
  const canvasElement = resolveStoryCanvas();
  if (!canvasElement) return;
  const placement = effectivePlacement(imageItem);
  currentPlacement = placement;
  styleOverlayForMode(overlay, placement);
  updateOverlayStyle(overlay);

  if (isSplitPlacement(placement)) {
    const compareSizes =
      sizes ??
      lastCompareSizes ??
      (() => {
        const img = overlay.querySelector("img");
        if (
          img instanceof HTMLImageElement &&
          img.naturalWidth > 0 &&
          img.naturalHeight > 0
        ) {
          return baselineCompareSizesFromNatural(
            img.naturalWidth,
            img.naturalHeight,
            VISUAL_COMPARE_PANE_PAD_PX,
            deviceScaleFactorForImage(imageItem),
          );
        }
        return null;
      })();
    const { baselinePane } = ensureSplit(
      canvasElement,
      placement,
      compareSizes,
    );
    if (overlay.parentElement !== baselinePane) {
      baselinePane.appendChild(overlay);
    }
    overlay.style.transform = "none";
    applyLiveVisibility(canvasElement);
    return;
  }

  teardownSplit(canvasElement);
  const canvasParent = canvasElement.parentElement;
  if (!canvasParent) return;
  const compareSizes =
    sizes ??
    lastCompareSizes ??
    (() => {
      const img = overlay.querySelector("img");
      if (
        img instanceof HTMLImageElement &&
        img.naturalWidth > 0 &&
        img.naturalHeight > 0
      ) {
        return baselineCompareSizesFromNatural(
          img.naturalWidth,
          img.naturalHeight,
          VISUAL_COMPARE_PANE_PAD_PX,
          deviceScaleFactorForImage(imageItem),
        );
      }
      return null;
    })();
  if (compareSizes) {
    lastCompareSizes = compareSizes;
    lockLiveContentWidth(canvasElement, compareSizes.content.width);
  }
  canvasParent.style.position = "relative";
  if (overlay.parentElement !== canvasParent) {
    canvasParent.appendChild(overlay);
  }
  const { x, y } = calculateCenterPosition(
    imageItem,
    canvasParent,
    canvasElement,
  );
  overlay.style.transform = `translate(${x}px, ${y}px)`;
  applyLiveVisibility(canvasElement);
}

function scheduleOverlayPosition(
  overlay: HTMLElement,
  imageItem: VisualDeltaImage,
  sizes?: BaselineCompareSizes | null,
) {
  applyOverlayPosition(overlay, imageItem, sizes);
  requestAnimationFrame(() => {
    applyOverlayPosition(overlay, imageItem, sizes);
    requestAnimationFrame(() =>
      applyOverlayPosition(overlay, imageItem, sizes),
    );
  });
}

function watchLayout(overlay: HTMLElement) {
  const canvasElement = resolveStoryCanvas();
  const canvasParent = canvasElement?.parentElement;
  if (!canvasElement || !canvasParent) return;
  layoutObserverRef?.disconnect();
  layoutObserverRef = new ResizeObserver(() => {
    if (!lastSelection) return;
    const item = lastSelection.images[lastSelection.index];
    if (!item) return;
    applyOverlayPosition(overlay, item);
  });
  layoutObserverRef.observe(canvasParent);
  layoutObserverRef.observe(canvasElement);
  const subject = canvasElement.querySelector(":scope > *");
  if (subject instanceof HTMLElement) {
    layoutObserverRef.observe(subject);
  }
}

function removeOverlayDom(retainSelection: boolean) {
  if (!retainSelection) {
    lastSelection = null;
  }
  layoutObserverRef?.disconnect();
  layoutObserverRef = null;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    if (dragCleanupRef) {
      dragCleanupRef();
      dragCleanupRef = null;
    }
    overlay.remove();
  }
  const canvasElement = resolveStoryCanvas();
  if (canvasElement) {
    teardownSplit(canvasElement);
    canvasElement.style.visibility = "";
  }
  syncModeBadge(false);
}

function clearOverlay() {
  removeOverlayDom(false);
}

function applySelection(attempt: number) {
  if (!lastSelection || lastSelection.index < 0) return;
  const selectedImageItem = lastSelection.images[lastSelection.index];
  if (!selectedImageItem) return;

  const canvasElement = resolveStoryCanvas();
  if (!canvasElement?.parentElement) {
    if (attempt < 40) {
      window.setTimeout(() => applySelection(attempt + 1), 50);
    }
    return;
  }

  currentPlacement = effectivePlacement(selectedImageItem);
  const overlay = ensureOverlayElement();
  styleOverlayForMode(overlay, currentPlacement);
  updateOverlayStyle(overlay);
  overlay.style.visibility = "";
  overlay.style.pointerEvents = isSplitPlacement(currentPlacement)
    ? "none"
    : "auto";
  const baselinePane = document.getElementById(BASELINE_PANE_ID);
  if (baselinePane instanceof HTMLElement) {
    baselinePane.style.visibility = "";
  }

  const img = overlay.querySelector("img");
  if (img) {
    const onReady = () => {
      sizeOverlayImageToCss(img, selectedImageItem);
      const sizes = baselineCompareSizesFromNatural(
        img.naturalWidth,
        img.naturalHeight,
        VISUAL_COMPARE_PANE_PAD_PX,
        deviceScaleFactorForImage(selectedImageItem),
      );
      scheduleOverlayPosition(overlay, selectedImageItem, sizes);
      watchLayout(overlay);
    };
    if (img.getAttribute("src") === selectedImageItem.src && img.complete) {
      onReady();
    } else {
      img.addEventListener("load", onReady, { once: true });
      img.src = selectedImageItem.src;
    }
  }
  scheduleOverlayPosition(overlay, selectedImageItem);
  watchLayout(overlay);
}

/**
 * Permanent channel listener — must outlive FORCE_REMOUNT / GOTO.
 * Decorator `useChannel` unsubscribes on unmount, which is exactly when the
 * panel re-emits SELECT_IMAGE for interaction baselines.
 */
export function ensureOverlayChannel(): void {
  if (overlayChannelInstalled) return;
  if (typeof window === "undefined") return;
  overlayChannelInstalled = true;
  const channel = addons.getChannel();

  channel.on(
    EVENTS.SELECT_IMAGE,
    (data: { index: number; images?: VisualDeltaImage[] }) => {
      if (
        data.index === -1 ||
        !data.images ||
        data.index >= data.images.length
      ) {
        clearOverlay();
        return;
      }
      const selectedImageItem = data.images[data.index];
      if (!selectedImageItem) return;
      lastSelection = { index: data.index, images: data.images };
      applySelection(0);
    },
  );

  channel.on(EVENTS.RESET_OVERLAY, () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || !lastSelection) return;
    const imageItem = lastSelection.images[lastSelection.index];
    if (!imageItem) return;
    scheduleOverlayPosition(overlay, imageItem);
  });

  channel.on(
    EVENTS.UPDATE_OVERLAY_STYLE,
    (data: {
      opacity: number;
      colorInversion: boolean;
      placement?: PlacementMode;
      liveVisible?: boolean;
    }) => {
      currentOpacity = data.opacity;
      currentColorInversion = data.colorInversion;
      if (typeof data.liveVisible === "boolean") {
        currentLiveVisible = data.liveVisible;
      }
      if (data.placement) {
        currentPlacement = normalizePlacement(data.placement);
        if (lastSelection) {
          const item = lastSelection.images[lastSelection.index];
          if (item) {
            lastSelection.images[lastSelection.index] = {
              ...item,
              placement: currentPlacement,
            };
          }
        }
      }
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) {
        styleOverlayForMode(overlay, currentPlacement);
        updateOverlayStyle(overlay);
      }
      if (overlay && lastSelection) {
        const imageItem = lastSelection.images[lastSelection.index];
        if (imageItem) scheduleOverlayPosition(overlay, imageItem);
      } else {
        const canvasElement = resolveStoryCanvas();
        if (canvasElement) applyLiveVisibility(canvasElement);
      }
    },
  );

  channel.on(EVENTS.HIDE_OVERLAY, () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.visibility = "hidden";
      overlay.style.pointerEvents = "none";
    }
    const baselinePane = document.getElementById(BASELINE_PANE_ID);
    if (baselinePane instanceof HTMLElement) {
      baselinePane.style.visibility = "hidden";
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        channel.emit(EVENTS.OVERLAY_HIDDEN, {});
      });
    });
  });

  channel.on(EVENTS.SHOW_OVERLAY, () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.visibility = "";
      overlay.style.pointerEvents = "";
    }
    const baselinePane = document.getElementById(BASELINE_PANE_ID);
    if (baselinePane instanceof HTMLElement) {
      baselinePane.style.visibility = "";
    }
    if (!overlay && lastSelection && lastSelection.index >= 0) {
      applySelection(0);
    }
  });
}

export const withSelectImage: DecoratorFunction = (storyFn, context) => {
  ensureOverlayChannel();
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  currentPlacement = normalizePlacement(visualDeltaParams?.placement);
  currentOpacity =
    visualDeltaParams?.opacity ??
    (isSplitPlacement(currentPlacement) ? 1 : 0.5);
  currentColorInversion = visualDeltaParams?.colorInversion ?? false;

  useEffect(() => {
    ensureOverlayChannel();
    if (lastSelection && lastSelection.index >= 0) {
      applySelection(0);
    }
    addons.getChannel().emit(EVENTS.OVERLAY_LISTENER_READY, {
      storyId: context.id,
    });
    return () => {
      // Keep the channel listener; only drop DOM so remount can rebuild.
      removeOverlayDom(true);
    };
  }, [context.id]);

  return storyFn();
};
