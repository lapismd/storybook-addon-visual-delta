import { addons, useEffect } from "storybook/preview-api";
import {
  DOCS_PREPARED,
  DOCS_RENDERED,
  SET_CURRENT_STORY,
} from "storybook/internal/core-events";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_PLACEMENT,
  EVENTS,
  deviceScaleFactorForImage,
  isSplitPlacement,
  normalizePlacement,
  viewportForImage,
  type PlacementMode,
  type BaselineGeometryMismatch,
  type VisualDeltaImage,
  type VisualDeltaParams,
} from "../constants.js";
import {
  baselineCompareSizesFromNatural,
  sharedScrollExtentSize,
  type BaselineCompareSizes,
} from "../shared/compare-viewport.js";
import {
  resolveFitZoomState,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import {
  VISUAL_CAPTURE_SURFACE_SELECTORS,
  measureVisualCaptureClip,
} from "../shared/capture-target.js";
import {
  baselineGeometryMismatch,
  isViewportSizedBaseline,
} from "../shared/geometry-mismatch.js";
import {
  baselineAlignmentMismatch,
  type BaselineAlignmentMismatch,
} from "../shared/story-config.js";
import {
  OVERLAY_CHIP_ID,
  ensureOverlayChip,
  positionOverlayChip,
  syncModeBadge,
} from "../shared/preview-chip.js";
import {
  baselineOuterInsets,
  bodyOuterInsets,
  totalInsets,
  type BackgroundSnapshot,
  type BoxSidesPx,
  type PreviewLayoutSnapshot,
} from "../shared/preview-layout.js";

const OVERLAY_ID = "visual-delta-overlay";
const SPLIT_ID = "visual-delta-split";
const PANES_WRAP_ID = "visual-delta-panes";
const LIVE_PANE_ID = "visual-delta-live-pane";
const BASELINE_PANE_ID = "visual-delta-baseline-pane";
const BASELINE_LAYOUT_FRAME_ID = "visual-delta-baseline-layout-frame";
const SCROLL_RAIL_V_ID = "visual-delta-scroll-rail-v";
const SCROLL_SPACER_V_ID = "visual-delta-scroll-spacer-v";
const SCROLL_RAIL_H_ID = "visual-delta-scroll-rail-h";
const SCROLL_SPACER_H_ID = "visual-delta-scroll-spacer-h";
const SCROLL_CORNER_ID = "visual-delta-scroll-corner";
/** Centered dashed rule between equal live/baseline split panes. */
const SPLIT_DIVIDER_ID = "visual-delta-split-divider";
/** Invisible box that forces equal scrollWidth/scrollHeight on both panes. */
const SCROLL_EXTENT_ATTR = "data-visual-delta-scroll-extent";
const RAIL_THICKNESS_PX = 12;
const SPLIT_DIVIDER_THICKNESS_PX = 1;
/** Storybook coral — readable mid-line on light and dark story canvases. */
const SPLIT_DIVIDER_COLOR = "#FF4785";

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
let liveViewportWidthRestoreRef: (() => void) | null = null;
/** Canvas laid out at the baseline capture viewport (may detach on remount). */
let liveViewportWidthCanvas: HTMLElement | null = null;
let liveCanvasSplitRestoreRef: (() => void) | null = null;
/** Canvas that received split min-height/height locks. */
let liveCanvasSplitSubject: HTMLElement | null = null;
let lastCompareSizes: BaselineCompareSizes | null = null;
let lastSelection: {
  index: number;
  images: VisualDeltaImage[];
  layoutSnapshot: PreviewLayoutSnapshot;
} | null = null;
/**
 * Bumped when selection is replaced or cleared so async applySelection /
 * image-load / rAF callbacks cannot reattach a stale overlay.
 */
let selectionGeneration = 0;
let currentPlacement: PlacementMode = DEFAULT_PLACEMENT;
/** False = image-only: hide live story, show baseline PNG (center + drag). */
let currentLiveVisible = true;
let currentOpacity = 0.5;
let currentColorInversion = false;
let currentBaselineLabelOffset = { x: 0, y: 0 };
let currentSplitZoom: CompareZoomState = { mode: "fit", scale: 1 };
let currentCropToViewport = false;
let lastGeometryStatusSignature = "";
let splitHostRestoreRef: (() => void) | null = null;
let centerHostRestoreRef: (() => void) | null = null;

function syncOverlayChip(overlay: HTMLElement) {
  return ensureOverlayChip(overlay, {
    offset: currentBaselineLabelOffset,
  });
}

/** Survives FORCE_REMOUNT / Vite HMR — decorator useChannel does not. */
const OVERLAY_CHANNEL_INSTALLED_KEY = "__visualDeltaOverlayChannelInstalled";
function isOverlayChannelInstalled(): boolean {
  return Boolean(
    (globalThis as typeof globalThis & Record<string, unknown>)[
      OVERLAY_CHANNEL_INSTALLED_KEY
    ],
  );
}
function markOverlayChannelInstalled() {
  (globalThis as typeof globalThis & Record<string, unknown>)[
    OVERLAY_CHANNEL_INSTALLED_KEY
  ] = true;
}
/**
 * Last viewMode from SET_CURRENT_STORY. Used to ignore SELECT/SHOW while Docs
 * (or other non-story modes) own the preview iframe.
 */
let previewViewMode: string | null = null;
let pendingSelection: {
  index: number;
  images?: VisualDeltaImage[];
  layoutSnapshot?: PreviewLayoutSnapshot;
} | null = null;

function isStoryPreviewMode(viewMode: string | null | undefined): boolean {
  return viewMode == null || viewMode === "story";
}

/**
 * Indirection so Vite HMR can replace handler bodies without stacking stale
 * `channel.on` listeners (which would keep pre-teardown soft-hide behavior).
 * Stored on globalThis so accept() updates the same bag the permanent
 * channel.on closures close over (module-local consts are replaced on HMR).
 */
type OverlayChannelApi = {
  onSetCurrentStory(payload?: { viewMode?: string; storyId?: string }): void;
  onDocsPrepared(): void;
  onDocsRendered(): void;
  onSelectImage(data: {
    index: number;
    images?: VisualDeltaImage[];
    layoutSnapshot?: PreviewLayoutSnapshot;
  }): void;
  onResetOverlay(): void;
  onUpdateOverlayStyle(data: {
    opacity: number;
    colorInversion: boolean;
    placement?: PlacementMode;
    liveVisible?: boolean;
    baselineLabelOffset?: { x: number; y: number };
    splitZoom?: CompareZoomState;
    cropToViewport?: boolean;
  }): void;
  onHideOverlay(): void;
  onShowOverlay(): void;
};

const OVERLAY_CHANNEL_API_KEY = "__visualDeltaOverlayChannelApi";

function getOverlayChannelApi(): OverlayChannelApi {
  const g = globalThis as typeof globalThis & {
    [OVERLAY_CHANNEL_API_KEY]?: OverlayChannelApi;
  };
  if (!g[OVERLAY_CHANNEL_API_KEY]) {
    g[OVERLAY_CHANNEL_API_KEY] = {
      onSetCurrentStory() {},
      onDocsPrepared() {},
      onDocsRendered() {},
      onSelectImage() {},
      onResetOverlay() {},
      onUpdateOverlayStyle() {},
      onHideOverlay() {},
      onShowOverlay() {},
    };
  }
  return g[OVERLAY_CHANNEL_API_KEY];
}

const overlayChannelApi = getOverlayChannelApi();

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
  const captureClip = measureVisualCaptureClip(
    VISUAL_CAPTURE_SURFACE_SELECTORS,
    canvasElement.ownerDocument,
  );
  if (captureClip) {
    return new DOMRect(
      captureClip.x,
      captureClip.y,
      captureClip.width,
      captureClip.height,
    );
  }
  const child = canvasElement.querySelector(":scope > *");
  if (child instanceof HTMLElement) {
    return child.getBoundingClientRect();
  }
  return canvasElement.getBoundingClientRect();
}

function emitBaselineGeometryStatus(
  status: BaselineGeometryMismatch | null,
  force = false,
) {
  const signature = status ? JSON.stringify(status) : "";
  if (!force && signature === lastGeometryStatusSignature) return;
  lastGeometryStatusSignature = signature;
  addons.getChannel().emit(EVENTS.BASELINE_GEOMETRY_STATUS, status);
}

let lastAlignmentStatusSignature = "";

function emitBaselineAlignmentStatus(
  status: BaselineAlignmentMismatch | null,
  force = false,
) {
  const signature = status ? JSON.stringify(status) : "";
  if (!force && signature === lastAlignmentStatusSignature) return;
  lastAlignmentStatusSignature = signature;
  addons.getChannel().emit(EVENTS.BASELINE_ALIGNMENT_STATUS, status);
}

function reportBaselineGeometry(
  canvasElement: HTMLElement,
  imageItem: VisualDeltaImage,
  sizes: BaselineCompareSizes | null | undefined,
) {
  if (!sizes) return;
  const subjectRect = resolveSubjectRect(canvasElement);
  const liveCss = { width: subjectRect.width, height: subjectRect.height };
  const captureViewport = viewportForImage(imageItem);
  emitBaselineGeometryStatus(
    baselineGeometryMismatch(
      sizes.content,
      liveCss,
      captureViewport,
      currentCropToViewport,
    ),
  );
  emitBaselineAlignmentStatus(
    baselineAlignmentMismatch({
      configured: imageItem.align,
      baselineCss: sizes.content,
      liveCss,
      captureViewport,
      cropToViewport: currentCropToViewport,
    }),
  );
}

function usesViewportCapture(
  imageItem: VisualDeltaImage,
  sizes: BaselineCompareSizes | null | undefined,
): boolean {
  return (
    currentCropToViewport ||
    imageItem.align === "viewport" ||
    Boolean(
      sizes &&
        isViewportSizedBaseline(sizes.content, viewportForImage(imageItem)),
    )
  );
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

function applyPadding(element: HTMLElement, sides: BoxSidesPx) {
  element.style.paddingTop = `${sides.top}px`;
  element.style.paddingRight = `${sides.right}px`;
  element.style.paddingBottom = `${sides.bottom}px`;
  element.style.paddingLeft = `${sides.left}px`;
}

function applyBackground(element: HTMLElement, background: BackgroundSnapshot) {
  element.style.backgroundColor = background.color;
  element.style.backgroundImage = background.image;
  element.style.backgroundPosition = background.position;
  element.style.backgroundSize = background.size;
  element.style.backgroundRepeat = background.repeat;
  element.style.backgroundAttachment = background.attachment;
  element.style.backgroundOrigin = background.origin;
  element.style.backgroundClip = background.clip;
}

function subtractSides(a: BoxSidesPx, b: BoxSidesPx): BoxSidesPx {
  return {
    top: Math.max(0, a.top - b.top),
    right: Math.max(0, a.right - b.right),
    bottom: Math.max(0, a.bottom - b.bottom),
    left: Math.max(0, a.left - b.left),
  };
}

/**
 * Rebuild only layout absent from a component-clipped PNG. The live pane
 * receives the body's measured outer box because moving `#storybook-root`
 * out of body flow would otherwise discard it.
 */
function syncMeasuredPaneLayout(
  livePane: HTMLElement,
  baselinePane: HTMLElement,
  baselineFrame: HTMLElement,
  overlay: HTMLElement,
  imageItem: VisualDeltaImage,
  snapshot: PreviewLayoutSnapshot,
  sizes?: BaselineCompareSizes | null,
) {
  const viewportCapture = usesViewportCapture(imageItem, sizes);
  const outerInsets = baselineOuterInsets(snapshot, {
    align: imageItem.align,
    cropToViewport: viewportCapture,
  });
  const bodyInsets = bodyOuterInsets(snapshot);
  const baselineBodyInsets = viewportCapture
    ? { top: 0, right: 0, bottom: 0, left: 0 }
    : bodyInsets;

  applyPadding(livePane, bodyInsets);
  applyPadding(baselinePane, baselineBodyInsets);
  applyBackground(livePane, snapshot.body.background);
  applyBackground(baselinePane, snapshot.body.background);
  applyBackground(baselineFrame, snapshot.root.background);

  baselineFrame.style.cssText += `
    position: relative;
    box-sizing: border-box;
    flex: 0 0 auto;
  `;
  const centeredComponent =
    snapshot.layout === "centered" && !viewportCapture && snapshot.subject;
  if (centeredComponent && snapshot.subject) {
    applyPadding(baselineFrame, {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    baselineFrame.style.width = `${snapshot.root.rect.width}px`;
    baselineFrame.style.height = `${snapshot.root.rect.height}px`;
    overlay.style.position = "absolute";
    overlay.style.left = `${
      snapshot.subject.rect.left - snapshot.root.rect.left
    }px`;
    overlay.style.top = `${
      snapshot.subject.rect.top - snapshot.root.rect.top
    }px`;
  } else {
    applyPadding(
      baselineFrame,
      viewportCapture
        ? { top: 0, right: 0, bottom: 0, left: 0 }
        : subtractSides(outerInsets, baselineBodyInsets),
    );
    baselineFrame.style.width = "max-content";
    baselineFrame.style.height = "max-content";
    overlay.style.position = "relative";
    overlay.style.left = "auto";
    overlay.style.top = "auto";
  }

  const paintRootBorder = !viewportCapture;
  const border = snapshot.root;
  baselineFrame.style.borderTopWidth = paintRootBorder
    ? `${border.border.top}px`
    : "0px";
  baselineFrame.style.borderRightWidth = paintRootBorder
    ? `${border.border.right}px`
    : "0px";
  baselineFrame.style.borderBottomWidth = paintRootBorder
    ? `${border.border.bottom}px`
    : "0px";
  baselineFrame.style.borderLeftWidth = paintRootBorder
    ? `${border.border.left}px`
    : "0px";
  baselineFrame.style.borderTopStyle = border.borderPaint.style.top;
  baselineFrame.style.borderRightStyle = border.borderPaint.style.right;
  baselineFrame.style.borderBottomStyle = border.borderPaint.style.bottom;
  baselineFrame.style.borderLeftStyle = border.borderPaint.style.left;
  baselineFrame.style.borderTopColor = border.borderPaint.color.top;
  baselineFrame.style.borderRightColor = border.borderPaint.color.right;
  baselineFrame.style.borderBottomColor = border.borderPaint.color.bottom;
  baselineFrame.style.borderLeftColor = border.borderPaint.color.left;

  const centerFrames = snapshot.layout === "centered" && !viewportCapture;
  for (const pane of [livePane, baselinePane]) {
    pane.style.display = "flex";
    pane.style.flexDirection = "column";
    pane.style.alignItems = centerFrames ? "center" : "flex-start";
    pane.style.justifyContent = centerFrames ? "center" : "flex-start";
  }
}

/**
 * Lay the Storybook canvas out at the baseline capture viewport, then let the
 * story subject keep its own natural width/max-width. Locking the subject to
 * the PNG width stretches max-width components and turns stale baselines into
 * live layout mutations.
 */
function lockLiveViewportWidth(
  canvasElement: HTMLElement,
  viewportWidth: number,
) {
  unlockLiveViewportWidth();
  const subject = canvasElement.querySelector(":scope > *");
  if (viewportWidth < 1) return;
  const prev = {
    width: canvasElement.style.width,
    maxWidth: canvasElement.style.maxWidth,
    minWidth: canvasElement.style.minWidth,
    boxSizing: canvasElement.style.boxSizing,
    scale: canvasElement.style.scale,
    transformOrigin: canvasElement.style.transformOrigin,
    subjectZoom: subject instanceof HTMLElement ? subject.style.zoom : "",
    subjectScale: subject instanceof HTMLElement ? subject.style.scale : "",
    subjectTransformOrigin:
      subject instanceof HTMLElement ? subject.style.transformOrigin : "",
  };
  canvasElement.style.boxSizing = "border-box";
  canvasElement.style.width = `${viewportWidth}px`;
  canvasElement.style.maxWidth = `${viewportWidth}px`;
  canvasElement.style.minWidth = `${viewportWidth}px`;
  liveViewportWidthCanvas = canvasElement;
  liveViewportWidthRestoreRef = () => {
    canvasElement.style.width = prev.width;
    canvasElement.style.maxWidth = prev.maxWidth;
    canvasElement.style.minWidth = prev.minWidth;
    canvasElement.style.boxSizing = prev.boxSizing;
    canvasElement.style.scale = prev.scale;
    canvasElement.style.transformOrigin = prev.transformOrigin;
    if (subject instanceof HTMLElement) {
      subject.style.zoom = prev.subjectZoom;
      subject.style.scale = prev.subjectScale;
      subject.style.transformOrigin = prev.subjectTransformOrigin;
    }
  };
}

function unlockLiveViewportWidth() {
  const restore = liveViewportWidthRestoreRef;
  const locked = liveViewportWidthCanvas;
  liveViewportWidthRestoreRef = null;
  liveViewportWidthCanvas = null;
  if (!restore && !locked) return;
  if (restore && locked?.isConnected) {
    restore();
    return;
  }
  // Remount can detach the locked subject — clear compare locks on the
  // current root so soft-hide restores the natural manager viewport.
  const currentCanvas = resolveStoryCanvas();
  if (currentCanvas instanceof HTMLElement) {
    currentCanvas.style.removeProperty("width");
    currentCanvas.style.removeProperty("max-width");
    currentCanvas.style.removeProperty("min-width");
    currentCanvas.style.removeProperty("scale");
    currentCanvas.style.removeProperty("transform-origin");
    const currentSubject = currentCanvas.querySelector(":scope > *");
    if (currentSubject instanceof HTMLElement) {
      currentSubject.style.removeProperty("zoom");
      currentSubject.style.removeProperty("scale");
      currentSubject.style.removeProperty("transform-origin");
    }
  }
}

function unlockLiveCanvasForSplit() {
  const restore = liveCanvasSplitRestoreRef;
  const locked = liveCanvasSplitSubject;
  liveCanvasSplitRestoreRef = null;
  liveCanvasSplitSubject = null;
  if (!restore && !locked) return;
  if (restore && locked?.isConnected) {
    restore();
    return;
  }
  const canvas = resolveStoryCanvas();
  if (canvas instanceof HTMLElement) {
    canvas.style.removeProperty("min-height");
    canvas.style.removeProperty("height");
  }
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
    const maxTop = Math.max(
      0,
      Math.max(livePane.scrollHeight, baselinePane.scrollHeight) -
        clientHeight(),
    );
    const maxLeft = Math.max(
      0,
      Math.max(livePane.scrollWidth, baselinePane.scrollWidth) -
        clientWidth(),
    );
    const nextTop = Math.max(0, Math.min(maxTop, top));
    const nextLeft = Math.max(0, Math.min(maxLeft, left));
    desiredTop = nextTop;
    desiredLeft = nextLeft;
    syncing = true;
    const generation = ++syncGeneration;
    livePane.scrollTop = nextTop;
    livePane.scrollLeft = nextLeft;
    baselinePane.scrollTop = nextTop;
    baselinePane.scrollLeft = nextLeft;
    if (vRail.style.display !== "none" && vRail.scrollTop !== nextTop) {
      vRail.scrollTop = nextTop;
    }
    if (hRail.style.display !== "none" && hRail.scrollLeft !== nextLeft) {
      hRail.scrollLeft = nextLeft;
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
    if (currentSplitZoom.mode === "fit") {
      for (const pane of [livePane, baselinePane]) {
        const extent = getOrCreateScrollExtent(pane);
        extent.style.width = "0px";
        extent.style.height = "0px";
      }
      vRail.style.display = "none";
      hRail.style.display = "none";
      const corner = document.getElementById(SCROLL_CORNER_ID);
      if (corner instanceof HTMLElement) corner.style.display = "none";
      split.style.gridTemplateColumns = "1fr 0px";
      split.style.gridTemplateRows = "1fr 0px";
      applyScroll(0, 0);
      return;
    }
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

    // Extent measurement temporarily removes each pane's spacer. Reapply the
    // shared position under the synchronization lock so a browser's reclamp
    // scroll event cannot replace it with a stale zero position.
    applyScroll(desiredTop, desiredLeft);
  };

  const onVRailScroll = () => {
    if (syncing && vRail.scrollTop === desiredTop) return;
    applyScroll(vRail.scrollTop, desiredLeft);
  };
  const onHRailScroll = () => {
    if (syncing && hRail.scrollLeft === desiredLeft) return;
    applyScroll(desiredTop, hRail.scrollLeft);
  };

  const onPaneScroll = (source: HTMLElement) => {
    if (syncing) return;
    applyScroll(source.scrollTop, source.scrollLeft);
  };

  const onWheel = (event: WheelEvent) => {
    // Fit locks both panes to the scaled frame with overflow hidden. Wheel
    // must not programmatically scroll — tiny subjects still inherit
    // Storybook `min-height: 100vh` scroll metrics inside tall panes.
    if (currentSplitZoom.mode === "fit") {
      event.preventDefault();
      applyScroll(0, 0);
      return;
    }
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
  unlockLiveViewportWidth();
  unlockLiveCanvasForSplit();
  lastCompareSizes = null;
  const split = document.getElementById(SPLIT_ID);
  if (split instanceof HTMLElement) {
    const host = split.parentElement;
    if (
      host &&
      canvasElement.parentElement === document.getElementById(LIVE_PANE_ID)
    ) {
      host.insertBefore(canvasElement, split);
    }
    split.remove();
  }
  splitHostRestoreRef?.();
  splitHostRestoreRef = null;
  applyLiveVisibility(canvasElement);
}

/**
 * Size both panes equally for compare:
 * - Each pane fills its preview split slot (half the iframe on the stacked axis,
 *   full slot on the free axis) so spare viewport space is used.
 * - Scroll rails appear only when zoomed content exceeds that slot — never
 *   because the pane was collapsed to the baseline CSS box.
 * - Do not reserve rail thickness up front; reserving 12px while content is
 *   full-iframe width creates a permanent 12px horizontal overflow.
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
  // Prefer the preview window viewport over the split host box. Short stories
  // leave `body` collapsed to the subject height (~96px) while the iframe is
  // still tall — Fit must use that spare viewport, not the collapsed host.
  const view = document.defaultView;
  const availW = Math.max(
    0,
    view?.innerWidth ||
      hostEl?.clientWidth ||
      sizes.viewport.width * 2,
  );
  const availH = Math.max(
    0,
    view?.innerHeight ||
      hostEl?.clientHeight ||
      sizes.viewport.height * 2,
  );
  const selectedImage = lastSelection?.images[lastSelection.index];
  const snapshot = lastSelection?.layoutSnapshot;
  if (!selectedImage || !snapshot) return;
  const viewportCapture = usesViewportCapture(selectedImage, sizes);
  const insets = totalInsets(
    baselineOuterInsets(snapshot, {
      align: selectedImage.align,
      cropToViewport: viewportCapture,
    }),
  );
  // Fit against the host split slot (half the preview), not a content-sized
  // pane — otherwise spare space is ignored and small subjects stay on Fit.
  const hostPaneW = horizontal
    ? Math.max(1, Math.floor((availW - 1) / 2))
    : Math.max(1, availW);
  const hostPaneH = horizontal
    ? Math.max(1, availH)
    : Math.max(1, Math.floor((availH - 1) / 2));
  const resolvedZoom = resolveFitZoomState(currentSplitZoom, {
    availableWidth: Math.max(1, hostPaneW - insets.x),
    availableHeight: Math.max(1, hostPaneH - insets.y),
    contentWidth: sizes.content.width,
    contentHeight: sizes.content.height,
  });
  const zoomScale = resolvedZoom.scale;

  // Always fill the split slot. Baseline-sized panes (e.g. 100px) left empty
  // host space below while live content (e.g. 168px) scrolled inside.
  const paneW = hostPaneW;
  const paneH = hostPaneH;

  for (const pane of [livePane, baselinePane]) {
    pane.style.width = `${paneW}px`;
    pane.style.height = `${paneH}px`;
    pane.style.flex = "0 0 auto";
    pane.style.overflow = resolvedZoom.mode === "fit" ? "hidden" : "auto";
  }

  panesWrap.style.width = horizontal
    ? `${paneW * 2 + SPLIT_DIVIDER_THICKNESS_PX}px`
    : `${paneW}px`;
  panesWrap.style.height = horizontal
    ? `${paneH}px`
    : `${paneH * 2 + SPLIT_DIVIDER_THICKNESS_PX}px`;

  lockLiveViewportWidth(canvasElement, snapshot.root.rect.width);
  reportBaselineGeometry(canvasElement, selectedImage, sizes);
  const subject = canvasElement.querySelector(":scope > *");
  const baselineImage = baselinePane.querySelector(`#${OVERLAY_ID} > img`);
  if (subject instanceof HTMLElement) {
    if (viewportCapture) {
      // The PNG already contains the root padding and border, so scale the
      // complete measured live frame by the same amount as the baseline.
      canvasElement.style.scale = String(zoomScale);
      canvasElement.style.transformOrigin = "top left";
    } else {
      // CSS `zoom` re-resolves percentage widths, so a width:100% subject can
      // remain visually full width. Individual transform `scale` preserves the
      // capture layout and shrinks its painted box for component clips.
      subject.style.zoom = "";
      subject.style.scale = String(zoomScale);
      subject.style.transformOrigin = "top left";
    }
  }
  if (baselineImage instanceof HTMLImageElement) {
    baselineImage.style.zoom = String(zoomScale);
  }
  currentSplitZoom = resolvedZoom;
  addons.getChannel().emit(EVENTS.SPLIT_ZOOM_STATUS, currentSplitZoom);
  sharedScrollRefreshRef?.();
}

function ensureSplit(
  canvasElement: HTMLElement,
  placement: PlacementMode,
  sizes?: BaselineCompareSizes | null,
): {
  livePane: HTMLElement;
  baselinePane: HTMLElement;
  baselineFrame: HTMLElement;
} {
  const existingSplit = document.getElementById(SPLIT_ID);
  const host =
    (existingSplit instanceof HTMLElement
      ? existingSplit.parentElement
      : null) ?? canvasElement.parentElement;
  if (!host) {
    throw new Error("Visual Delta: canvas has no parent");
  }

  let split = document.getElementById(SPLIT_ID);
  let panesWrap = document.getElementById(PANES_WRAP_ID);
  let livePane = document.getElementById(LIVE_PANE_ID);
  let baselinePane = document.getElementById(BASELINE_PANE_ID);
  let baselineFrame = document.getElementById(BASELINE_LAYOUT_FRAME_ID);
  let divider = document.getElementById(SPLIT_DIVIDER_ID);
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
    !(baselineFrame instanceof HTMLElement) ||
    !(divider instanceof HTMLElement) ||
    !(vRail instanceof HTMLElement) ||
    !(vSpacer instanceof HTMLElement) ||
    !(hRail instanceof HTMLElement) ||
    !(hSpacer instanceof HTMLElement) ||
    !(corner instanceof HTMLElement);

  if (needsBuild) {
    unbindSharedScroll();
    if (
      split instanceof HTMLElement &&
      canvasElement.parentElement?.id === LIVE_PANE_ID
    ) {
      split.parentElement?.insertBefore(canvasElement, split);
    }
    split?.remove();
    splitHostRestoreRef?.();
    splitHostRestoreRef = null;
    split = document.createElement("div");
    split.id = SPLIT_ID;
    panesWrap = document.createElement("div");
    panesWrap.id = PANES_WRAP_ID;
    livePane = document.createElement("div");
    livePane.id = LIVE_PANE_ID;
    baselinePane = document.createElement("div");
    baselinePane.id = BASELINE_PANE_ID;
    baselineFrame = document.createElement("div");
    baselineFrame.id = BASELINE_LAYOUT_FRAME_ID;
    divider = document.createElement("div");
    divider.id = SPLIT_DIVIDER_ID;
    divider.setAttribute("aria-hidden", "true");
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
    centerHostRestoreRef?.();
    centerHostRestoreRef = null;
    const hostStyles = {
      position: host.style.position,
      minHeight: host.style.minHeight,
    };
    host.style.position = "relative";
    splitHostRestoreRef = () => {
      host.style.position = hostStyles.position;
      host.style.minHeight = hostStyles.minHeight;
    };
    host.insertBefore(split, canvasElement);
    livePane.appendChild(canvasElement);
    baselinePane.appendChild(baselineFrame);
    panesWrap.appendChild(livePane);
    panesWrap.appendChild(divider);
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
    !(baselineFrame instanceof HTMLElement) ||
    !(divider instanceof HTMLElement) ||
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
  const snapshot = lastSelection?.layoutSnapshot;
  if (!snapshot) {
    throw new Error("Visual Delta: measured preview layout missing");
  }
  // The split is absolutely positioned inside the host. Short stories leave
  // body collapsed to the subject height; stretch to the preview viewport so
  // above/below Fit can use the spare iframe space.
  const previewHeight = Math.max(
    snapshot.body.rect.height,
    document.defaultView?.innerHeight ?? 0,
  );
  host.style.minHeight = `${previewHeight}px`;
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
    background: transparent;
  `;
  panesWrap.style.cssText = `
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: ${horizontal ? "row" : "column"};
    align-items: stretch;
    justify-content: flex-start;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    gap: 0;
    background: transparent;
  `;
  divider.style.cssText = horizontal
    ? `
      flex: 0 0 ${SPLIT_DIVIDER_THICKNESS_PX}px;
      width: ${SPLIT_DIVIDER_THICKNESS_PX}px;
      align-self: stretch;
      box-sizing: border-box;
      pointer-events: none;
      border: none;
      border-left: ${SPLIT_DIVIDER_THICKNESS_PX}px dashed ${SPLIT_DIVIDER_COLOR};
      background: transparent;
    `
    : `
      flex: 0 0 ${SPLIT_DIVIDER_THICKNESS_PX}px;
      height: ${SPLIT_DIVIDER_THICKNESS_PX}px;
      align-self: stretch;
      width: 100%;
      box-sizing: border-box;
      pointer-events: none;
      border: none;
      border-top: ${SPLIT_DIVIDER_THICKNESS_PX}px dashed ${SPLIT_DIVIDER_COLOR};
      background: transparent;
    `;
  vRail.style.cssText = `
    grid-column: 2;
    grid-row: 1;
    overflow-y: scroll;
    overflow-x: hidden;
    background: transparent;
  `;
  hRail.style.cssText = `
    grid-column: 1;
    grid-row: 2;
    overflow-x: scroll;
    overflow-y: hidden;
    background: transparent;
  `;
  corner.style.cssText = `
    grid-column: 2;
    grid-row: 2;
    background: transparent;
  `;
  if (needsBuild) {
    vSpacer.style.cssText = `width: 1px; height: 1px;`;
    hSpacer.style.cssText = `width: 1px; height: 1px;`;
  }

  livePane.style.cssText = `${paneStyleBase()} background: transparent;`;
  baselinePane.style.cssText = `${paneStyleBase()} background: transparent;`;
  livePane.style.padding = "0";
  baselinePane.style.padding = "0";
  applyBackground(split, snapshot.body.background);
  applyBackground(livePane, snapshot.body.background);
  applyBackground(baselinePane, snapshot.body.background);
  applyBackground(vRail, snapshot.body.background);
  applyBackground(hRail, snapshot.body.background);
  applyBackground(corner, snapshot.body.background);

  const baselineFirst = placement === "left" || placement === "above";
  const first = baselineFirst ? baselinePane : livePane;
  const second = baselineFirst ? livePane : baselinePane;
  const ordered = [first, divider, second];
  const current = Array.from(panesWrap.children);
  if (
    current.length !== ordered.length ||
    ordered.some((node, index) => current[index] !== node)
  ) {
    for (const node of ordered) {
      panesWrap.appendChild(node);
    }
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
  return { livePane, baselinePane, baselineFrame };
}

function ensureOverlayElement(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay instanceof HTMLElement) {
    syncOverlayChip(overlay);
    return overlay;
  }

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
  syncOverlayChip(overlay);
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
  // cssText on the overlay must not leave a stale/missing Baseline chip —
  // re-attach after every mode style pass (split left/right/above/below + center).
  syncOverlayChip(overlay);
}

function effectivePlacement(imageItem: VisualDeltaImage): PlacementMode {
  return normalizePlacement(
    imageItem.placement ?? currentPlacement ?? DEFAULT_PLACEMENT,
  );
}

function updateOverlayStyle(overlay: HTMLElement | null) {
  if (!overlay) return;
  syncOverlayChip(overlay);
  // Blend/opacity on the PNG only so the Baseline chip stays solid.
  const img = overlay.querySelector(":scope > img");
  overlay.style.mixBlendMode = "normal";
  overlay.style.opacity = "1";
  if (!(img instanceof HTMLImageElement)) return;
  if (isSplitPlacement(currentPlacement)) {
    img.style.mixBlendMode = "normal";
    img.style.opacity = "1";
  } else {
    img.style.zoom = "";
    img.style.mixBlendMode = currentColorInversion ? "difference" : "normal";
    img.style.opacity = String(currentOpacity);
  }
}

function calculateCenterPosition(
  imageItem: VisualDeltaImage,
  canvasParent: HTMLElement,
  canvasElement: HTMLElement,
  sizes?: BaselineCompareSizes | null,
) {
  let x = imageItem.offsetX ?? 0;
  let y = imageItem.offsetY ?? 0;
  const scale = getCanvasScale(canvasParent);
  const parentRect = canvasParent.getBoundingClientRect();

  if (usesViewportCapture(imageItem, sizes)) {
    x += -parentRect.left / scale;
    y += -parentRect.top / scale;
    return { x, y };
  }

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
            0,
            deviceScaleFactorForImage(imageItem),
          );
        }
        return null;
      })();
    const { livePane, baselinePane, baselineFrame } = ensureSplit(
      canvasElement,
      placement,
      compareSizes,
    );
    if (overlay.parentElement !== baselineFrame) {
      baselineFrame.appendChild(overlay);
    }
    const snapshot = lastSelection?.layoutSnapshot;
    if (!snapshot) return;
    syncMeasuredPaneLayout(
      livePane,
      baselinePane,
      baselineFrame,
      overlay,
      imageItem,
      snapshot,
      compareSizes,
    );
    overlay.style.transform = "none";
    if (compareSizes) {
      const panesWrap = document.getElementById(PANES_WRAP_ID);
      if (panesWrap instanceof HTMLElement) {
        applyEqualPaneViewports(
          canvasElement,
          livePane,
          baselinePane,
          panesWrap,
          placement,
          compareSizes,
        );
      }
    }
    // Chip rides on the overlay inside the baseline pane for left/right/above/below.
    syncOverlayChip(overlay);
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
          0,
          deviceScaleFactorForImage(imageItem),
        );
      }
      return null;
    })();
  if (compareSizes) {
    lastCompareSizes = compareSizes;
    const snapshot = lastSelection?.layoutSnapshot;
    if (!snapshot) return;
    lockLiveViewportWidth(canvasElement, snapshot.root.rect.width);
    reportBaselineGeometry(canvasElement, imageItem, compareSizes);
  }
  if (!centerHostRestoreRef) {
    const previousPosition = canvasParent.style.position;
    canvasParent.style.position = "relative";
    centerHostRestoreRef = () => {
      canvasParent.style.position = previousPosition;
    };
  }
  if (overlay.parentElement !== canvasParent) {
    canvasParent.appendChild(overlay);
  }
  const { x, y } = calculateCenterPosition(
    imageItem,
    canvasParent,
    canvasElement,
    compareSizes,
  );
  overlay.style.transform = `translate(${x}px, ${y}px)`;
  requestAnimationFrame(() => {
    if (overlay.isConnected) {
      positionOverlayChip(overlay, currentBaselineLabelOffset);
    }
  });
  applyLiveVisibility(canvasElement);
}

function selectionStillCurrent(
  generation: number,
  imageItem: VisualDeltaImage,
): boolean {
  if (generation !== selectionGeneration || !lastSelection) return false;
  const current = lastSelection.images[lastSelection.index];
  return Boolean(current && current.src === imageItem.src);
}

function scheduleOverlayPosition(
  overlay: HTMLElement,
  imageItem: VisualDeltaImage,
  sizes: BaselineCompareSizes | null | undefined,
  generation: number,
) {
  if (!selectionStillCurrent(generation, imageItem)) return;
  applyOverlayPosition(overlay, imageItem, sizes);
  requestAnimationFrame(() => {
    if (!selectionStillCurrent(generation, imageItem)) return;
    applyOverlayPosition(overlay, imageItem, sizes);
    requestAnimationFrame(() => {
      if (!selectionStillCurrent(generation, imageItem)) return;
      applyOverlayPosition(overlay, imageItem, sizes);
    });
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
    pendingSelection = null;
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
    centerHostRestoreRef?.();
    centerHostRestoreRef = null;
    canvasElement.style.visibility = "";
  } else {
    // Docs / mid-navigation can drop `#storybook-root` before cleanup runs —
    // still tear down split chrome by id so the baseline PNG cannot orphan.
    unbindSharedScroll();
    unlockLiveViewportWidth();
    unlockLiveCanvasForSplit();
    splitHostRestoreRef?.();
    splitHostRestoreRef = null;
    centerHostRestoreRef?.();
    centerHostRestoreRef = null;
    lastCompareSizes = null;
    document.getElementById(SPLIT_ID)?.remove();
  }
  syncModeBadge(false);
  emitBaselineGeometryStatus(null, true);
  emitBaselineAlignmentStatus(null, true);
}

function clearOverlay() {
  selectionGeneration += 1;
  removeOverlayDom(false);
}

/** Hard-clear when the preview leaves Canvas story mode (Docs, etc.). */
function clearOverlayForNonStoryView(viewMode?: string | null) {
  if (viewMode != null) previewViewMode = viewMode;
  if (isStoryPreviewMode(previewViewMode)) return;
  clearOverlay();
}

function applySelection(attempt: number, generation = selectionGeneration) {
  if (generation !== selectionGeneration) return;
  if (!lastSelection || lastSelection.index < 0) return;
  const selectedImageItem = lastSelection.images[lastSelection.index];
  if (!selectedImageItem) return;

  const canvasElement = resolveStoryCanvas();
  if (!canvasElement?.parentElement) {
    if (attempt < 40) {
      window.setTimeout(() => applySelection(attempt + 1, generation), 50);
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
  // Hide Baseline chrome until the PNG loads so story switches never show a
  // chip without a bitmap.
  const pendingChip = overlay.querySelector(
    `:scope > #${CSS.escape(OVERLAY_CHIP_ID)}`,
  );
  if (pendingChip instanceof HTMLElement) {
    pendingChip.style.visibility = "hidden";
  }

  const img = overlay.querySelector("img");
  if (img) {
    const onFailed = () => {
      if (!selectionStillCurrent(generation, selectedImageItem)) return;
      // Failed/404 URL must not leave Baseline chrome without a bitmap.
      clearOverlay();
    };
    const onReady = () => {
      if (!selectionStillCurrent(generation, selectedImageItem)) return;
      if (img.naturalWidth === 0) {
        onFailed();
        return;
      }
      const chip = syncOverlayChip(overlay);
      chip.style.visibility = "";
      sizeOverlayImageToCss(img, selectedImageItem);
      const sizes = baselineCompareSizesFromNatural(
        img.naturalWidth,
        img.naturalHeight,
        0,
        deviceScaleFactorForImage(selectedImageItem),
      );
      scheduleOverlayPosition(overlay, selectedImageItem, sizes, generation);
      watchLayout(overlay);
    };
    img.addEventListener("error", onFailed, { once: true });
    if (img.getAttribute("src") === selectedImageItem.src && img.complete) {
      onReady();
    } else {
      img.addEventListener("load", onReady, { once: true });
      img.src = selectedImageItem.src;
    }
  }
  scheduleOverlayPosition(overlay, selectedImageItem, null, generation);
  watchLayout(overlay);
}

function syncOverlayChannelApi(): void {
  const channel = addons.getChannel();

  overlayChannelApi.onSetCurrentStory = (payload) => {
    clearOverlayForNonStoryView(payload?.viewMode);
  };
  overlayChannelApi.onDocsPrepared = () => {
    previewViewMode = "docs";
    clearOverlay();
  };
  overlayChannelApi.onDocsRendered = () => {
    previewViewMode = "docs";
    clearOverlay();
  };
  overlayChannelApi.onSelectImage = (data) => {
    if (data.index === -1 || !data.images || data.index >= data.images.length) {
      clearOverlay();
      return;
    }
    // Panel can race Docs navigation and re-SELECT after soft leave.
    if (!isStoryPreviewMode(previewViewMode)) {
      clearOverlay();
      return;
    }
    const selectedImageItem = data.images[data.index];
    if (!selectedImageItem) return;
    if (!data.layoutSnapshot) {
      // SELECT can race storyFinished. Keep it pending and paint nothing; the
      // manager re-emits the same selection after measured geometry is ready.
      pendingSelection = data;
      return;
    }
    pendingSelection = null;
    selectionGeneration += 1;
    lastSelection = {
      index: data.index,
      images: data.images,
      layoutSnapshot: data.layoutSnapshot,
    };
    applySelection(0, selectionGeneration);
  };
  overlayChannelApi.onResetOverlay = () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || !lastSelection) return;
    const imageItem = lastSelection.images[lastSelection.index];
    if (!imageItem) return;
    scheduleOverlayPosition(overlay, imageItem, null, selectionGeneration);
  };
  overlayChannelApi.onUpdateOverlayStyle = (data) => {
    currentOpacity = data.opacity;
    currentColorInversion = data.colorInversion;
    if (typeof data.liveVisible === "boolean") {
      currentLiveVisible = data.liveVisible;
    }
    if (data.baselineLabelOffset) {
      currentBaselineLabelOffset = { ...data.baselineLabelOffset };
    }
    if (data.splitZoom) {
      currentSplitZoom = { ...data.splitZoom };
    }
    if (typeof data.cropToViewport === "boolean") {
      currentCropToViewport = data.cropToViewport;
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
      if (imageItem) {
        scheduleOverlayPosition(overlay, imageItem, null, selectionGeneration);
      }
    } else {
      const canvasElement = resolveStoryCanvas();
      if (canvasElement) applyLiveVisibility(canvasElement);
    }
  };
  overlayChannelApi.onHideOverlay = () => {
    // Soft-hide keeps lastSelection (panel index) but tears down overlay +
    // split panes so the live canvas reclaims full preview space.
    selectionGeneration += 1;
    removeOverlayDom(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        channel.emit(EVENTS.OVERLAY_HIDDEN, {});
      });
    });
  };
  overlayChannelApi.onShowOverlay = () => {
    if (!isStoryPreviewMode(previewViewMode)) {
      clearOverlay();
      return;
    }
    if (lastSelection && lastSelection.index >= 0) {
      selectionGeneration += 1;
      applySelection(0, selectionGeneration);
      return;
    }
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.visibility = "";
      overlay.style.pointerEvents = "";
    }
    const baselinePane = document.getElementById(BASELINE_PANE_ID);
    if (baselinePane instanceof HTMLElement) {
      baselinePane.style.visibility = "";
    }
  };
}

/**
 * Permanent channel listener — must outlive FORCE_REMOUNT / GOTO.
 * Decorator `useChannel` unsubscribes on unmount, which is exactly when the
 * panel re-emits SELECT_IMAGE for interaction baselines.
 *
 * Handlers are installed once via {@link overlayChannelApi} so Vite HMR can
 * refresh teardown logic without leaving a stale soft-hide listener that only
 * toggled visibility and kept split panes.
 */
export function ensureOverlayChannel(): void {
  if (typeof window === "undefined") return;
  const api = getOverlayChannelApi();
  syncOverlayChannelApi();
  if (isOverlayChannelInstalled()) return;
  markOverlayChannelInstalled();
  const channel = addons.getChannel();

  channel.on(
    SET_CURRENT_STORY,
    (payload?: { viewMode?: string; storyId?: string }) => {
      api.onSetCurrentStory(payload);
    },
  );
  channel.on(DOCS_PREPARED, () => {
    api.onDocsPrepared();
  });
  channel.on(DOCS_RENDERED, () => {
    api.onDocsRendered();
  });
  channel.on(
    EVENTS.SELECT_IMAGE,
    (data: {
      index: number;
      images?: VisualDeltaImage[];
      layoutSnapshot?: PreviewLayoutSnapshot;
    }) => {
      api.onSelectImage(data);
    },
  );
  channel.on(EVENTS.RESET_OVERLAY, () => {
    api.onResetOverlay();
  });
  channel.on(
    EVENTS.UPDATE_OVERLAY_STYLE,
    (data: {
      opacity: number;
      colorInversion: boolean;
      placement?: PlacementMode;
      liveVisible?: boolean;
      baselineLabelOffset?: { x: number; y: number };
    }) => {
      api.onUpdateOverlayStyle(data);
    },
  );
  channel.on(EVENTS.HIDE_OVERLAY, () => {
    api.onHideOverlay();
  });
  channel.on(EVENTS.SHOW_OVERLAY, () => {
    api.onShowOverlay();
  });
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    syncOverlayChannelApi();
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
  currentBaselineLabelOffset = visualDeltaParams?.baselineLabelOffset ?? {
    x: 0,
    y: 0,
  };

  useEffect(() => {
    ensureOverlayChannel();
    const viewMode =
      typeof context.viewMode === "string" ? context.viewMode : null;
    if (viewMode != null) previewViewMode = viewMode;
    if (!isStoryPreviewMode(viewMode)) {
      clearOverlay();
      return () => {
        clearOverlay();
      };
    }
    // Never re-paint the previous story's baseline here. Panel re-SELECT_IMAGE
    // via INIT_IMAGE / OVERLAY_LISTENER_READY after remount.
    addons.getChannel().emit(EVENTS.OVERLAY_LISTENER_READY, {
      storyId: context.id,
    });
    return () => {
      // Drop DOM + selection on story leave / remount. Same-story remount is
      // restored when the panel answers OVERLAY_LISTENER_READY.
      clearOverlay();
    };
  }, [context.id, context.viewMode]);

  return storyFn();
};
