import { toPng } from "html-to-image";
import { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT } from "../constants.js";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import {
  VISUAL_CAPTURE_SURFACE_SELECTORS,
  measureVisualCaptureClip,
} from "../shared/capture-target.js";
import {
  resolvePaintedBackground,
  toOpaqueRgb,
} from "../shared/preview-background.js";
import {
  measurePreviewLayout,
  type PreviewLayoutSnapshot,
  type StorybookLayoutMode,
} from "../shared/preview-layout.js";

export type CaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
};

type IframeSizeStyles = {
  width: string;
  height: string;
  maxWidth: string;
  maxHeight: string;
  minWidth: string;
  minHeight: string;
};

type VerifiedPreviewViewportOptions = {
  storyId: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  delay?: number;
  signal?: AbortSignal;
  timeout?: number;
};

export type CaptureViewportDiagnostics = {
  requestedViewport: { width: number; height: number };
  observedViewport: { width: number; height: number };
  deviceScaleFactor: number;
};

export class PreviewViewportEstablishmentError extends Error {
  constructor(
    requested: { width: number; height: number },
    observed: { width: number; height: number },
    readiness?: string,
  ) {
    super(
      `Unable to establish Diff HTML viewport ${requested.width}×${requested.height}; ` +
        `observed ${observed.width}×${observed.height}` +
        (readiness ? ` (${readiness})` : "") +
        ".",
    );
    this.name = "PreviewViewportEstablishmentError";
  }
}

export class PreviewLayoutSettlementError extends Error {
  constructor(storyId: string, readiness?: string) {
    super(
      `Unable to settle preview layout for overlay on ${storyId}` +
        (readiness ? ` (${readiness})` : "") +
        ".",
    );
    this.name = "PreviewLayoutSettlementError";
  }
}

class PreviewIframeReplacedError extends Error {
  constructor() {
    super("Storybook replaced the preview iframe during Diff HTML capture");
    this.name = "PreviewIframeReplacedError";
  }
}

export function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getPreviewIframe(): HTMLIFrameElement | null {
  const iframe = document.getElementById("storybook-preview-iframe");
  return iframe instanceof HTMLIFrameElement ? iframe : null;
}

/** True when preview-owned Visual Delta DOM must be removed before measuring. */
export function previewContainsVisualDeltaDom(): boolean {
  const doc = getPreviewIframe()?.contentDocument;
  return Boolean(
    doc?.querySelector(
      "#visual-delta-overlay, #visual-delta-split, #visual-delta-panes",
    ),
  );
}

/**
 * Read layout from the manager's current preview iframe. This is intentionally
 * separate from the viewport transaction so the same settled geometry can be
 * tested without raster capture.
 */
export function measureCurrentPreviewLayout(options: {
  storyId: string;
  viewport: { width: number; height: number };
  layout?: StorybookLayoutMode | null;
}): PreviewLayoutSnapshot {
  const iframe = getPreviewIframe();
  const doc = iframe?.contentDocument;
  if (!doc) {
    throw new Error("Storybook preview iframe not found");
  }
  return measurePreviewLayout(doc, options);
}

/**
 * Settle story readiness at the manager's current preview size and measure
 * layout for overlay / split positioning.
 *
 * Unlike Diff HTML capture, this MUST NOT resize the iframe to the Playwright
 * capture viewport — that resize is the main source of multi-second overlay
 * gaps after reload when a placement is already selected.
 */
export async function measureSettledOverlayLayout(options: {
  storyId: string;
  layout?: StorybookLayoutMode | null;
  signal?: AbortSignal;
  timeout?: number;
}): Promise<PreviewLayoutSnapshot> {
  const iframe = getPreviewIframe();
  const doc = iframe?.contentDocument;
  if (!iframe || !doc?.documentElement) {
    throw new Error("Storybook preview iframe not found");
  }
  if (!iframe.isConnected || getPreviewIframe() !== iframe) {
    throw new PreviewIframeReplacedError();
  }
  const observed = await waitForSettledPreview({
    iframe,
    doc,
    storyId: options.storyId,
    signal: options.signal,
    timeout: options.timeout ?? 5_000,
    requireFonts: false,
  });
  if (!iframe.isConnected || getPreviewIframe() !== iframe) {
    throw new PreviewIframeReplacedError();
  }
  return measurePreviewLayout(doc, {
    storyId: options.storyId,
    viewport: observed,
    layout: options.layout,
  });
}

function nextFrame(view: Window): Promise<void> {
  return new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("Diff HTML capture aborted", "AbortError");
}

function readObservedViewport(iframe: HTMLIFrameElement): {
  width: number;
  height: number;
} {
  return {
    width: iframe.contentWindow?.innerWidth ?? 0,
    height: iframe.contentWindow?.innerHeight ?? 0,
  };
}

type StableLayout = {
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  bodyLeft: number;
  bodyTop: number;
  bodyWidth: number;
  bodyHeight: number;
  rootLeft: number;
  rootTop: number;
  rootWidth: number;
  rootHeight: number;
  subjectLeft: number;
  subjectTop: number;
  subjectWidth: number;
  subjectHeight: number;
};

function readStableLayout(
  iframe: HTMLIFrameElement,
  doc: Document,
): StableLayout {
  const observed = readObservedViewport(iframe);
  const root = doc.querySelector("#storybook-root");
  const bodyRect = doc.body.getBoundingClientRect();
  const rootRect = root?.getBoundingClientRect();
  const subjectRect = root?.firstElementChild?.getBoundingClientRect();
  const captureClip = measureVisualCaptureClip(
    VISUAL_CAPTURE_SURFACE_SELECTORS,
    doc,
  );
  return {
    viewportWidth: observed.width,
    viewportHeight: observed.height,
    documentWidth: doc.documentElement.scrollWidth,
    documentHeight: doc.documentElement.scrollHeight,
    bodyLeft: bodyRect.left,
    bodyTop: bodyRect.top,
    bodyWidth: bodyRect.width,
    bodyHeight: bodyRect.height,
    rootLeft: rootRect?.left ?? 0,
    rootTop: rootRect?.top ?? 0,
    rootWidth: rootRect?.width ?? 0,
    rootHeight: rootRect?.height ?? 0,
    subjectLeft: captureClip?.x ?? subjectRect?.left ?? 0,
    subjectTop: captureClip?.y ?? subjectRect?.top ?? 0,
    subjectWidth: captureClip?.width ?? subjectRect?.width ?? 0,
    subjectHeight: captureClip?.height ?? subjectRect?.height ?? 0,
  };
}

function sameLayout(a: StableLayout | null, b: StableLayout): boolean {
  if (!a) return false;
  return (Object.keys(b) as Array<keyof StableLayout>).every(
    (key) => Math.abs(a[key] - b[key]) <= 0.5,
  );
}

function largestLayoutDelta(a: StableLayout | null, b: StableLayout): string {
  if (!a) return "initial";
  const [key, delta] = (Object.keys(b) as Array<keyof StableLayout>).reduce<
    [keyof StableLayout, number]
  >(
    (largest, candidate) => {
      const next = Math.abs(a[candidate] - b[candidate]);
      return next > largest[1] ? [candidate, next] : largest;
    },
    ["viewportWidth", 0],
  );
  return `${key}:${delta.toFixed(3)}`;
}

function hasPreparationOverlay(doc: Document): boolean {
  return Boolean(
    doc.querySelector(".sb-show-preparing-story, .sb-show-preparing-docs"),
  );
}

async function settleUsedPreviewFonts(doc: Document): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts) return;
  if (typeof fonts.load !== "function") {
    await fonts.ready;
    return;
  }
  const root = doc.querySelector("#storybook-root");
  const elements = [
    doc.body,
    ...(root ? [root] : []),
    ...(root?.firstElementChild ? [root.firstElementChild] : []),
    ...doc.querySelectorAll(VISUAL_CAPTURE_SURFACE_SELECTORS),
  ];
  const requests = new Set<string>();
  for (const element of elements) {
    const style = doc.defaultView?.getComputedStyle(element);
    if (!style) continue;
    const font =
      style.font ||
      `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font.trim()) requests.add(font);
  }
  await Promise.allSettled(
    Array.from(requests, (font) => fonts.load(font, "BESbswy 0123456789")),
  );
}

type PreviewSettlementOptions = {
  iframe: HTMLIFrameElement;
  doc: Document;
  storyId: string;
  signal?: AbortSignal;
  timeout: number;
  /**
   * When set, the observed iframe viewport must match exactly (Diff HTML /
   * capture). When omitted, settle at the current manager preview size (overlay).
   */
  viewport?: { width: number; height: number };
  /**
   * Diff HTML waits for used fonts. Overlay positioning only needs story
   * readiness + stable boxes so SELECT_IMAGE is not blocked on font loading.
   */
  requireFonts?: boolean;
};

async function waitForSettledPreview(
  options: PreviewSettlementOptions,
): Promise<{ width: number; height: number }> {
  const {
    iframe,
    doc,
    storyId,
    signal,
    timeout,
    viewport,
    requireFonts = true,
  } = options;
  const view = iframe.contentWindow;
  if (!view) {
    throw new Error("Cannot access preview window (cross-origin or not ready)");
  }
  const deadline = performance.now() + timeout;
  let previous: StableLayout | null = null;
  let fontsSettledAfterStory = !requireFonts || !doc.fonts?.ready;
  let fontSettlementStarted = fontsSettledAfterStory;
  let lastReadiness = "preview not sampled";
  while (performance.now() <= deadline) {
    throwIfAborted(signal);
    await nextFrame(view);
    if (!iframe.isConnected || getPreviewIframe() !== iframe) {
      throw new PreviewIframeReplacedError();
    }
    const current = readStableLayout(iframe, doc);
    const exactViewport =
      !viewport ||
      (current.viewportWidth === viewport.width &&
        current.viewportHeight === viewport.height);
    const storyFinished =
      doc.documentElement.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR) ===
      storyId;
    const preparing = hasPreparationOverlay(doc);
    if (
      requireFonts &&
      exactViewport &&
      storyFinished &&
      !preparing &&
      !fontSettlementStarted
    ) {
      fontSettlementStarted = true;
      void settleUsedPreviewFonts(doc).then(() => {
        fontsSettledAfterStory = true;
      });
    }
    const layoutStable = sameLayout(previous, current);
    const layoutDelta = largestLayoutDelta(previous, current);
    lastReadiness = [
      `exactViewport=${exactViewport}`,
      `storyFinished=${storyFinished}`,
      `fonts=${doc.fonts?.status ?? "unavailable"}`,
      `fontsSettledAfterStory=${fontsSettledAfterStory}`,
      `requireFonts=${requireFonts}`,
      `preparing=${preparing}`,
      `layoutStable=${layoutStable}`,
      `largestDelta=${layoutDelta}`,
    ].join(", ");
    if (
      exactViewport &&
      storyFinished &&
      fontsSettledAfterStory &&
      !preparing &&
      layoutStable
    ) {
      return {
        width: current.viewportWidth,
        height: current.viewportHeight,
      };
    }
    previous =
      exactViewport && storyFinished && fontsSettledAfterStory && !preparing
        ? current
        : null;
  }
  if (viewport) {
    throw new PreviewViewportEstablishmentError(
      viewport,
      readObservedViewport(iframe),
      lastReadiness,
    );
  }
  throw new PreviewLayoutSettlementError(storyId, lastReadiness);
}

async function waitForStableRequestedViewport(options: {
  iframe: HTMLIFrameElement;
  doc: Document;
  viewport: { width: number; height: number };
  storyId: string;
  signal?: AbortSignal;
  timeout: number;
}): Promise<{ width: number; height: number }> {
  return waitForSettledPreview(options);
}

function readIframeSizeStyles(iframe: HTMLIFrameElement): IframeSizeStyles {
  return {
    width: iframe.style.width,
    height: iframe.style.height,
    maxWidth: iframe.style.maxWidth,
    maxHeight: iframe.style.maxHeight,
    minWidth: iframe.style.minWidth,
    minHeight: iframe.style.minHeight,
  };
}

function writeIframeSizeStyles(
  iframe: HTMLIFrameElement,
  styles: IframeSizeStyles,
) {
  iframe.style.width = styles.width;
  iframe.style.height = styles.height;
  iframe.style.maxWidth = styles.maxWidth;
  iframe.style.maxHeight = styles.maxHeight;
  iframe.style.minWidth = styles.minWidth;
  iframe.style.minHeight = styles.minHeight;
}

/**
 * Force the Storybook preview iframe to a fixed CSS size (Playwright baseline
 * viewport). Returns a restore function for the previous inline size styles.
 */
export function applyPreviewViewport(
  width: number,
  height: number,
): (() => void) | null {
  const iframe = getPreviewIframe();
  if (!iframe || width < 1 || height < 1) return null;
  const prev = readIframeSizeStyles(iframe);
  writeIframeSizeStyles(iframe, {
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: "none",
    maxHeight: "none",
    minWidth: `${width}px`,
    minHeight: `${height}px`,
  });
  return () => writeIframeSizeStyles(iframe, prev);
}

/**
 * Establish and prove a baseline viewport without resizing manager chrome.
 * Geometry, scroll positions, and focus are restored even when capture aborts
 * or rasterization fails.
 */
async function withVerifiedPreviewViewportAttempt<T>(
  fn: () => Promise<T>,
  options: VerifiedPreviewViewportOptions,
): Promise<{ result: T; diagnostics: CaptureViewportDiagnostics }> {
  const iframe = getPreviewIframe();
  if (!iframe) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  const view = iframe.contentWindow;
  if (!doc?.documentElement || !view) {
    throw new Error(
      "Cannot access preview document (cross-origin or not ready)",
    );
  }
  const viewport = options.viewport ?? VISUAL_VIEWPORT;
  const deviceScaleFactor =
    options.deviceScaleFactor ?? VISUAL_DEVICE_SCALE_FACTOR;
  const iframeStyles = readIframeSizeStyles(iframe);
  const originalViewport = readObservedViewport(iframe);
  const managerActive =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const previewActive = asHtmlElement(
    doc.activeElement instanceof Element ? doc.activeElement : null,
    view,
  );
  const previewScroll = { x: view.scrollX, y: view.scrollY };
  const wrapperScroll = Array.from(iframe.parentElement?.children ?? [])
    .concat(
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "#storybook-preview-wrapper, #storybook-preview-wrapper *",
        ),
      ),
    )
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map((node) => ({
      node,
      left: node.scrollLeft,
      top: node.scrollTop,
    }));

  writeIframeSizeStyles(iframe, {
    width: `${viewport.width}px`,
    height: `${viewport.height}px`,
    maxWidth: "none",
    maxHeight: "none",
    minWidth: `${viewport.width}px`,
    minHeight: `${viewport.height}px`,
  });
  view.scrollTo(0, 0);
  try {
    throwIfAborted(options.signal);
    const observedViewport = await waitForStableRequestedViewport({
      iframe,
      doc,
      viewport,
      storyId: options.storyId,
      signal: options.signal,
      timeout: options.timeout ?? 5_000,
    });
    const delay = options.delay ?? 0;
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, delay);
        options.signal?.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(new DOMException("Diff HTML capture aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
    throwIfAborted(options.signal);
    if (!iframe.isConnected || getPreviewIframe() !== iframe) {
      throw new PreviewIframeReplacedError();
    }
    const result = await fn();
    throwIfAborted(options.signal);
    if (!iframe.isConnected || getPreviewIframe() !== iframe) {
      throw new PreviewIframeReplacedError();
    }
    return {
      result,
      diagnostics: {
        requestedViewport: viewport,
        observedViewport,
        deviceScaleFactor,
      },
    };
  } finally {
    if (iframe.isConnected && getPreviewIframe() === iframe) {
      writeIframeSizeStyles(iframe, iframeStyles);
      view.scrollTo(previewScroll.x, previewScroll.y);
      for (const scroll of wrapperScroll) {
        scroll.node.scrollLeft = scroll.left;
        scroll.node.scrollTop = scroll.top;
      }
      if (originalViewport.width > 0 && originalViewport.height > 0) {
        await waitForStableRequestedViewport({
          iframe,
          doc,
          viewport: originalViewport,
          storyId: options.storyId,
          timeout: 1_000,
        });
      } else {
        await waitTwoFrames();
      }
    }
    if (
      previewActive?.isConnected &&
      iframe.isConnected &&
      getPreviewIframe() === iframe
    ) {
      previewActive.focus({ preventScroll: true });
    } else if (managerActive?.isConnected) {
      managerActive.focus({ preventScroll: true });
    }
  }
}

/**
 * Establish and prove the baseline viewport, retrying transparently when
 * Storybook remounts its preview iframe during manager/HMR updates.
 */
export async function withVerifiedPreviewViewport<T>(
  fn: () => Promise<T>,
  options: VerifiedPreviewViewportOptions,
): Promise<{ result: T; diagnostics: CaptureViewportDiagnostics }> {
  try {
    return await withVerifiedPreviewViewportAttempt(fn, options);
  } catch (error) {
    if (!(error instanceof PreviewIframeReplacedError)) throw error;
    throwIfAborted(options.signal);
    return withVerifiedPreviewViewportAttempt(fn, options);
  }
}

/** Load natural pixel size of a baseline image (device-scale PNG pixels). */
export function loadImageSize(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image size: ${src}`));
    img.src = src;
  });
}

/**
 * `instanceof HTMLElement` fails across iframe realms (parent window vs preview
 * document). Compare against the owning window's constructor instead.
 */
function asHtmlElement(
  node: Element | null | undefined,
  view: Window | null,
): HTMLElement | null {
  if (!node) return null;
  // `Window` typings omit constructor properties; iframe realms expose them.
  const Ctor =
    (view as (Window & { HTMLElement?: typeof HTMLElement }) | null)
      ?.HTMLElement ?? HTMLElement;
  return node instanceof Ctor ? (node as HTMLElement) : null;
}

/**
 * Match Playwright visual suite settle: kill animations/transitions, hide caret,
 * and drop play-function focus rings so live Diff matches chrome-free baselines.
 * Optionally hides ignore-selector regions for the capture duration.
 * Returns a restore function.
 */
function preparePreviewForVisualCapture(
  doc: Document,
  ignoreSelectors: readonly string[] = [],
): () => void {
  const view = doc.defaultView;
  const style = doc.createElement("style");
  style.setAttribute("data-visual-delta-capture", "1");
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }
  `;
  doc.documentElement.appendChild(style);

  const active = asHtmlElement(
    doc.activeElement instanceof Element ? doc.activeElement : null,
    view,
  );
  active?.blur();

  const hidden: Array<{ el: HTMLElement; visibility: string }> = [];
  for (const sel of ignoreSelectors) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const node of nodes) {
      const el = asHtmlElement(node, view);
      if (!el) continue;
      hidden.push({ el, visibility: el.style.visibility });
      el.style.visibility = "hidden";
    }
  }

  return () => {
    style.remove();
    for (const { el, visibility } of hidden) {
      el.style.visibility = visibility;
    }
    if (active?.isConnected) active.focus({ preventScroll: true });
  };
}

/**
 * Playwright element screenshots include the painted page background behind a
 * transparent subject. html-to-image does not — fill with the preview body's
 * computed background (sampled to rgb so canvas always accepts it).
 */
function resolveCaptureBackground(doc: Document): string {
  return toOpaqueRgb(resolvePaintedBackground(doc), document);
}

type CaptureTarget = {
  element: HTMLElement;
  /**
   * When set, `element` is the preview body (so portaled nodes paint) and the
   * PNG is cropped to this subject+portal union in CSS pixels.
   */
  cropCss?: { x: number; y: number; width: number; height: number };
};

function measureSubjectPortalUnion(
  doc: Document,
): { x: number; y: number; width: number; height: number } | null {
  return measureVisualCaptureClip(VISUAL_CAPTURE_SURFACE_SELECTORS, doc);
}

function resolveCaptureTarget(doc: Document): CaptureTarget {
  const view = doc.defaultView;
  const root = asHtmlElement(doc.querySelector("#storybook-root"), view);
  if (!root) {
    throw new Error("#storybook-root not found in preview");
  }
  const subject = asHtmlElement(root.firstElementChild, view) ?? root;
  const cropCss = measureSubjectPortalUnion(doc);
  if (!cropCss) {
    return { element: subject };
  }
  // Capture body so portaled menus/dialogs are in the bitmap, then crop to the
  // subject+portal union (not full `100vh` root / viewport).
  const body = asHtmlElement(doc.body, view);
  if (!body) {
    throw new Error("Preview document body not found");
  }
  return { element: body, cropCss };
}

async function cropDataUrlToCssRect(
  dataUrl: string,
  cropCss: { x: number; y: number; width: number; height: number },
  /** Top-left of the captured element in the same CSS space as `cropCss`. */
  originCss: { x: number; y: number },
  pixelRatio: number,
): Promise<CaptureResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to decode capture for crop"));
    el.src = dataUrl;
  });
  const sx = Math.max(0, Math.floor((cropCss.x - originCss.x) * pixelRatio));
  const sy = Math.max(0, Math.floor((cropCss.y - originCss.y) * pixelRatio));
  const sw = Math.max(1, Math.ceil(cropCss.width * pixelRatio));
  const sh = Math.max(1, Math.ceil(cropCss.height * pixelRatio));
  const width = Math.min(sw, Math.max(1, img.naturalWidth - sx));
  const height = Math.min(sh, Math.max(1, img.naturalHeight - sy));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to get canvas context for crop");
  ctx.drawImage(img, sx, sy, width, height, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

/**
 * Capture the story subject (first `#storybook-root` child, or body cropped to
 * the subject+portal union when menus/dialogs are open) — matches Playwright
 * component-clipped baselines.
 */
export async function capturePreviewSubject(options?: {
  pixelRatio?: number;
  /** CSS selectors to hide for the capture (CSF `ignoreSelectors` + builtins). */
  ignoreSelectors?: readonly string[];
  /**
   * When true, capture the preview documentElement (viewport) instead of the
   * story subject (CSF `cropToViewport`).
   */
  cropToViewport?: boolean;
  /** Proven CSS viewport used for an exact full-viewport capture. */
  viewport?: { width: number; height: number };
}): Promise<CaptureResult> {
  const iframe = getPreviewIframe();
  if (!iframe) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) {
    throw new Error(
      "Cannot access preview document (cross-origin or not ready)",
    );
  }

  const restoreCapturePrep = preparePreviewForVisualCapture(
    doc,
    options?.ignoreSelectors ?? [],
  );
  try {
    await waitTwoFrames();

    const pixelRatio = options?.pixelRatio ?? VISUAL_DEVICE_SCALE_FACTOR;
    const target: CaptureTarget = options?.cropToViewport
      ? {
          element:
            asHtmlElement(doc.documentElement, doc.defaultView) ??
            resolveCaptureTarget(doc).element,
        }
      : resolveCaptureTarget(doc);
    const rect = target.element.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.ceil(
        options?.cropToViewport
          ? (options.viewport?.width ?? doc.defaultView?.innerWidth ?? 0)
          : rect.width,
      ),
    );
    const height = Math.max(
      1,
      Math.ceil(
        options?.cropToViewport
          ? (options.viewport?.height ?? doc.defaultView?.innerHeight ?? 0)
          : rect.height,
      ),
    );

    try {
      const dataUrl = await toPng(target.element, {
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio,
        backgroundColor: resolveCaptureBackground(doc),
        cacheBust: true,
        skipAutoScale: true,
      });
      if (target.cropCss) {
        return cropDataUrlToCssRect(
          dataUrl,
          target.cropCss,
          { x: rect.left, y: rect.top },
          pixelRatio,
        );
      }
      return { dataUrl, width, height };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to capture preview subject: ${message}`);
    }
  } finally {
    restoreCapturePrep();
  }
}

/**
 * Capture the Storybook preview iframe as a PNG.
 *
 * When `width`/`height` are provided (typically the Playwright baseline size),
 * temporarily resizes the iframe so layout matches the baseline viewport before
 * capturing — otherwise the manager pane (~400px) reflows and pad/crop invents
 * a huge false diff against 1280×N baselines.
 */
export async function capturePreviewIframe(options?: {
  width?: number;
  height?: number;
  pixelRatio?: number;
}): Promise<CaptureResult> {
  const iframe = getPreviewIframe();
  if (!iframe) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc?.documentElement || !win) {
    throw new Error(
      "Cannot access preview document (cross-origin or not ready)",
    );
  }

  const prev = readIframeSizeStyles(iframe);

  const width =
    options?.width ??
    Math.ceil(
      Math.max(
        doc.documentElement.scrollWidth,
        doc.body?.scrollWidth ?? 0,
        win.innerWidth,
      ),
    );
  const height =
    options?.height ??
    Math.ceil(
      Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
        win.innerHeight,
      ),
    );

  if (width < 1 || height < 1) {
    throw new Error("Preview document has zero size");
  }

  applyPreviewViewport(width, height);
  const restoreCapturePrep = preparePreviewForVisualCapture(doc);

  try {
    await waitTwoFrames();
    // Allow layout/fonts a beat after resize (matches Playwright settle intent).
    await new Promise((r) => setTimeout(r, 50));

    const dataUrl = await toPng(doc.documentElement, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: options?.pixelRatio ?? VISUAL_DEVICE_SCALE_FACTOR,
      backgroundColor: resolveCaptureBackground(doc),
      cacheBust: true,
      skipAutoScale: true,
    });
    return { dataUrl, width, height };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to capture preview: ${message}`);
  } finally {
    restoreCapturePrep();
    writeIframeSizeStyles(iframe, prev);
  }
}

/**
 * Fit actual → baseline size without stretching (center pad / crop).
 * Matches Playwright sidecar compare (`fitRgba` in playwright/compare-pixels.ts).
 */
export function fitImageData(
  imgData: ImageData,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  if (imgData.width === targetWidth && imgData.height === targetHeight) {
    return imgData.data;
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to get canvas context");
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imgData.width;
  tempCanvas.height = imgData.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("Unable to get temp canvas context");
  tempCtx.putImageData(imgData, 0, 0);
  const ox = Math.floor((targetWidth - imgData.width) / 2);
  const oy = Math.floor((targetHeight - imgData.height) / 2);
  ctx.drawImage(tempCanvas, ox, oy);
  return ctx.getImageData(0, 0, targetWidth, targetHeight).data;
}

export function loadImage(src: string): Promise<{
  imageData: ImageData;
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // `crossOrigin` on data: URLs can yield an empty decode in Chromium.
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({
        imageData: ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight),
        dataUrl: canvas.toDataURL("image/png"),
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

const DIFF_ALPHA_IGNORE_THRESHOLD = 8;
const DIFF_ALPHA_IGNORE_DILATE_RADIUS = 1;

export function maskTransparentRegions(
  baselineData: Uint8ClampedArray,
  actualData: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = DIFF_ALPHA_IGNORE_THRESHOLD,
  dilateRadius = DIFF_ALPHA_IGNORE_DILATE_RADIUS,
) {
  const baselineForDiff = new Uint8ClampedArray(baselineData);
  const actualForDiff = new Uint8ClampedArray(actualData);
  const ignore = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const a = baselineForDiff[p * 4 + 3] ?? 0;
    if (a <= alphaThreshold) ignore[p] = 1;
  }
  if (dilateRadius > 0) {
    const expanded = new Uint8Array(ignore);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!ignore[idx]) continue;
        const y0 = Math.max(0, y - dilateRadius);
        const y1 = Math.min(height - 1, y + dilateRadius);
        const x0 = Math.max(0, x - dilateRadius);
        const x1 = Math.min(width - 1, x + dilateRadius);
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            expanded[yy * width + xx] = 1;
          }
        }
      }
    }
    ignore.set(expanded);
  }
  for (let p = 0; p < width * height; p++) {
    if (!ignore[p]) continue;
    const i = p * 4;
    baselineForDiff[i] = 0;
    baselineForDiff[i + 1] = 0;
    baselineForDiff[i + 2] = 0;
    baselineForDiff[i + 3] = 0;
    actualForDiff[i] = 0;
    actualForDiff[i + 1] = 0;
    actualForDiff[i + 2] = 0;
    actualForDiff[i + 3] = 0;
  }
  return { baselineForDiff, actualForDiff, ignore };
}
