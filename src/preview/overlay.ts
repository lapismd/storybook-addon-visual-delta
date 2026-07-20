import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_PLACEMENT,
  EVENTS,
  VISUAL_DEVICE_SCALE_FACTOR,
  isSplitPlacement,
  normalizePlacement,
  type PlacementMode,
  type VisualDeltaImage,
  type VisualDeltaParams,
} from "../constants.js";

const OVERLAY_ID = "visual-delta-overlay";
const SPLIT_ID = "visual-delta-split";
const PANES_WRAP_ID = "visual-delta-panes";
const LIVE_PANE_ID = "visual-delta-live-pane";
const BASELINE_PANE_ID = "visual-delta-baseline-pane";
const SCROLL_RAIL_ID = "visual-delta-scroll-rail";
const SCROLL_SPACER_ID = "visual-delta-scroll-spacer";

/** Device-scale PNGs display at CSS size so they match the live subject. */
function sizeOverlayImageToCss(img: HTMLImageElement) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  img.style.width = `${img.naturalWidth / VISUAL_DEVICE_SCALE_FACTOR}px`;
  img.style.height = `${img.naturalHeight / VISUAL_DEVICE_SCALE_FACTOR}px`;
}

let dragCleanupRef: (() => void) | null = null;
let layoutObserverRef: ResizeObserver | null = null;
let sharedScrollCleanupRef: (() => void) | null = null;
let sharedScrollRefreshRef: (() => void) | null = null;
let lastSelection: {
  index: number;
  images: VisualDeltaImage[];
} | null = null;
let currentPlacement: PlacementMode = DEFAULT_PLACEMENT;

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
    overlay.style.cursor =
      currentPlacement === "center" ? "grab" : "default";
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

function paneStyle(): string {
  return `
    flex: 1 1 50%;
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
 * padding onto the baseline pane so the PNG lines up with the live subject.
 */
function syncBaselinePaneInset(
  canvasElement: HTMLElement,
  baselinePane: HTMLElement,
) {
  const style = getComputedStyle(canvasElement);
  baselinePane.style.paddingTop = style.paddingTop;
  baselinePane.style.paddingRight = style.paddingRight;
  baselinePane.style.paddingBottom = style.paddingBottom;
  baselinePane.style.paddingLeft = style.paddingLeft;
  baselinePane.style.borderTopWidth = style.borderTopWidth;
  baselinePane.style.borderRightWidth = style.borderRightWidth;
  baselinePane.style.borderBottomWidth = style.borderBottomWidth;
  baselinePane.style.borderLeftWidth = style.borderLeftWidth;
  baselinePane.style.borderStyle = "solid";
  baselinePane.style.borderColor = "transparent";
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

/**
 * One visible scrollbar (rail) drives both panes' scroll positions. Pane
 * scrollbars stay hidden so the compare reads as a single scroll surface.
 */
function bindSharedScrollRail(
  split: HTMLElement,
  livePane: HTMLElement,
  baselinePane: HTMLElement,
  rail: HTMLElement,
  spacer: HTMLElement,
) {
  unbindSharedScroll();

  const applyScroll = (top: number, left: number) => {
    livePane.scrollTop = top;
    livePane.scrollLeft = left;
    baselinePane.scrollTop = top;
    baselinePane.scrollLeft = left;
  };

  const refreshSpacer = () => {
    const maxScrollHeight = Math.max(
      livePane.scrollHeight,
      baselinePane.scrollHeight,
    );
    spacer.style.height = `${maxScrollHeight}px`;
    spacer.style.width = "1px";
    rail.style.display =
      maxScrollHeight > livePane.clientHeight + 1 ? "" : "none";
    if (rail.scrollTop !== livePane.scrollTop) {
      rail.scrollTop = livePane.scrollTop;
    }
  };

  const onRailScroll = () => {
    applyScroll(rail.scrollTop, livePane.scrollLeft);
  };

  const onWheel = (event: WheelEvent) => {
    // Drive both panes from one gesture; keep the rail thumb in sync.
    event.preventDefault();
    const maxTop = Math.max(
      0,
      Math.max(livePane.scrollHeight, baselinePane.scrollHeight) -
        livePane.clientHeight,
    );
    const maxLeft = Math.max(
      0,
      Math.max(livePane.scrollWidth, baselinePane.scrollWidth) -
        livePane.clientWidth,
    );
    const nextTop = Math.max(
      0,
      Math.min(maxTop, livePane.scrollTop + event.deltaY),
    );
    const nextLeft = Math.max(
      0,
      Math.min(maxLeft, livePane.scrollLeft + event.deltaX),
    );
    applyScroll(nextTop, nextLeft);
    if (rail.style.display !== "none") {
      rail.scrollTop = nextTop;
    }
  };

  rail.addEventListener("scroll", onRailScroll, { passive: true });
  split.addEventListener("wheel", onWheel, { passive: false });

  const ro = new ResizeObserver(() => refreshSpacer());
  ro.observe(livePane);
  ro.observe(baselinePane);
  const liveChild = livePane.querySelector(":scope > *");
  const baselineChild = baselinePane.querySelector(":scope > *");
  if (liveChild instanceof HTMLElement) ro.observe(liveChild);
  if (baselineChild instanceof HTMLElement) ro.observe(baselineChild);
  refreshSpacer();

  sharedScrollRefreshRef = refreshSpacer;
  sharedScrollCleanupRef = () => {
    rail.removeEventListener("scroll", onRailScroll);
    split.removeEventListener("wheel", onWheel);
    ro.disconnect();
    sharedScrollRefreshRef = null;
  };
}

function teardownSplit(canvasElement: HTMLElement) {
  unbindSharedScroll();
  const split = document.getElementById(SPLIT_ID);
  if (!(split instanceof HTMLElement)) return;
  const host = split.parentElement;
  if (!host) return;
  if (canvasElement.parentElement === document.getElementById(LIVE_PANE_ID)) {
    host.insertBefore(canvasElement, split);
  }
  split.remove();
}

function ensureSplit(
  canvasElement: HTMLElement,
  placement: PlacementMode,
): { livePane: HTMLElement; baselinePane: HTMLElement } {
  const host = canvasElement.parentElement;
  if (!host) {
    throw new Error("Visual Delta: canvas has no parent");
  }

  let split = document.getElementById(SPLIT_ID);
  let panesWrap = document.getElementById(PANES_WRAP_ID);
  let livePane = document.getElementById(LIVE_PANE_ID);
  let baselinePane = document.getElementById(BASELINE_PANE_ID);
  let rail = document.getElementById(SCROLL_RAIL_ID);
  let spacer = document.getElementById(SCROLL_SPACER_ID);

  const needsBuild =
    !(split instanceof HTMLElement) ||
    !(panesWrap instanceof HTMLElement) ||
    !(livePane instanceof HTMLElement) ||
    !(baselinePane instanceof HTMLElement) ||
    !(rail instanceof HTMLElement) ||
    !(spacer instanceof HTMLElement);

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
    rail = document.createElement("div");
    rail.id = SCROLL_RAIL_ID;
    spacer = document.createElement("div");
    spacer.id = SCROLL_SPACER_ID;
    host.style.position = "relative";
    host.insertBefore(split, canvasElement);
    livePane.appendChild(canvasElement);
    panesWrap.appendChild(livePane);
    panesWrap.appendChild(baselinePane);
    rail.appendChild(spacer);
    split.appendChild(panesWrap);
    split.appendChild(rail);
  }

  ensurePaneScrollbarStyles();

  const horizontal = placement === "left" || placement === "right";
  host.style.minHeight = "100vh";
  split.style.cssText = `
    display: flex;
    flex-direction: row;
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.12);
  `;
  panesWrap.style.cssText = `
    display: flex;
    flex: 1 1 auto;
    flex-direction: ${horizontal ? "row" : "column"};
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    gap: 1px;
    background: rgba(0, 0, 0, 0.12);
  `;
  rail.style.cssText = `
    flex: 0 0 auto;
    width: 12px;
    overflow-y: scroll;
    overflow-x: hidden;
    background: var(--sb-color-bg, #fff);
  `;
  spacer.style.cssText = `width: 1px; height: 1px;`;

  livePane.style.cssText = `${paneStyle()} background: var(--sb-color-bg, #fff);`;
  baselinePane.style.cssText = `${paneStyle()} background: var(--sb-color-bg, #fff);`;
  // Live story keeps padding on `#storybook-root`; mirror it for the baseline.
  livePane.style.padding = "0";
  syncBaselinePaneInset(canvasElement, baselinePane);

  // Pane order: baseline first for left/above, live first for right/below.
  const baselineFirst = placement === "left" || placement === "above";
  const first = baselineFirst ? baselinePane : livePane;
  const second = baselineFirst ? livePane : baselinePane;
  if (panesWrap.firstElementChild !== first) {
    panesWrap.appendChild(first);
    panesWrap.appendChild(second);
  }

  if (needsBuild || !sharedScrollCleanupRef) {
    bindSharedScrollRail(split, livePane, baselinePane, rail, spacer);
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

export const withSelectImage: DecoratorFunction = (storyFn, context) => {
  const canvasElement = context.canvasElement as HTMLElement;
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  currentPlacement = normalizePlacement(visualDeltaParams?.placement);
  let currentOpacity =
    visualDeltaParams?.opacity ??
    (isSplitPlacement(currentPlacement) ? 1 : 0.5);
  let currentColorInversion = visualDeltaParams?.colorInversion ?? false;

  const effectivePlacement = (imageItem: VisualDeltaImage): PlacementMode =>
    normalizePlacement(
      imageItem.placement ?? currentPlacement ?? DEFAULT_PLACEMENT,
    );

  const updateOverlayStyle = (overlay: HTMLElement | null) => {
    if (!overlay) return;
    const placement = currentPlacement;
    if (isSplitPlacement(placement)) {
      overlay.style.mixBlendMode = "normal";
      overlay.style.opacity = "1";
    } else {
      overlay.style.mixBlendMode = currentColorInversion
        ? "difference"
        : "normal";
      overlay.style.opacity = String(currentOpacity);
    }
  };

  const calculateCenterPosition = (
    imageItem: VisualDeltaImage,
    canvasParent: HTMLElement,
  ) => {
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
  };

  const applyOverlayPosition = (
    overlay: HTMLElement,
    imageItem: VisualDeltaImage,
  ) => {
    const placement = effectivePlacement(imageItem);
    currentPlacement = placement;
    styleOverlayForMode(overlay, placement);
    updateOverlayStyle(overlay);

    if (isSplitPlacement(placement)) {
      const { baselinePane } = ensureSplit(canvasElement, placement);
      if (overlay.parentElement !== baselinePane) {
        baselinePane.appendChild(overlay);
      }
      overlay.style.transform = "none";
      return;
    }

    teardownSplit(canvasElement);
    const canvasParent = canvasElement.parentElement;
    if (!canvasParent) return;
    canvasParent.style.position = "relative";
    if (overlay.parentElement !== canvasParent) {
      canvasParent.appendChild(overlay);
    }
    const { x, y } = calculateCenterPosition(imageItem, canvasParent);
    overlay.style.transform = `translate(${x}px, ${y}px)`;
  };

  const scheduleOverlayPosition = (
    overlay: HTMLElement,
    imageItem: VisualDeltaImage,
  ) => {
    applyOverlayPosition(overlay, imageItem);
    requestAnimationFrame(() => {
      applyOverlayPosition(overlay, imageItem);
      requestAnimationFrame(() => applyOverlayPosition(overlay, imageItem));
    });
  };

  const watchLayout = (overlay: HTMLElement) => {
    const canvasParent = canvasElement.parentElement;
    if (!canvasParent) return;
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
  };

  const clearOverlay = () => {
    lastSelection = null;
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
    teardownSplit(canvasElement);
  };

  const emit = useChannel({
    [EVENTS.SELECT_IMAGE]: (data: {
      index: number;
      images?: VisualDeltaImage[];
    }) => {
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
      currentPlacement = effectivePlacement(selectedImageItem);
      if (!canvasElement.parentElement) return;

      const overlay = ensureOverlayElement();
      styleOverlayForMode(overlay, currentPlacement);
      updateOverlayStyle(overlay);

      const img = overlay.querySelector("img");
      if (img) {
        const onReady = () => {
          sizeOverlayImageToCss(img);
          scheduleOverlayPosition(overlay, selectedImageItem);
          watchLayout(overlay);
        };
        if (img.src === selectedImageItem.src && img.complete) {
          onReady();
        } else {
          img.addEventListener("load", onReady, { once: true });
          img.src = selectedImageItem.src;
        }
      }
      scheduleOverlayPosition(overlay, selectedImageItem);
      watchLayout(overlay);
    },
    [EVENTS.RESET_OVERLAY]: () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay || !lastSelection) return;
      const imageItem = lastSelection.images[lastSelection.index];
      if (!imageItem) return;
      scheduleOverlayPosition(overlay, imageItem);
    },
    [EVENTS.UPDATE_OVERLAY_STYLE]: (data: {
      opacity: number;
      colorInversion: boolean;
      placement?: PlacementMode;
    }) => {
      currentOpacity = data.opacity;
      currentColorInversion = data.colorInversion;
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
      }
    },
    [EVENTS.HIDE_OVERLAY]: () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) {
        overlay.style.display = "none";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            emit(EVENTS.OVERLAY_HIDDEN, {});
          });
        });
      } else {
        emit(EVENTS.OVERLAY_HIDDEN, {});
      }
    },
    [EVENTS.SHOW_OVERLAY]: () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) {
        overlay.style.display = "";
      }
    },
  });

  useEffect(() => {
    return () => {
      clearOverlay();
    };
  }, []);

  return storyFn();
};
