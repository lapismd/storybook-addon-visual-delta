import { toPng } from "html-to-image";
import { VISUAL_DEVICE_SCALE_FACTOR } from "../constants.js";

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

function waitTwoFrames(): Promise<void> {
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

const PORTAL_SELECTORS = [
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[data-state="open"]',
].join(", ");

/**
 * `instanceof HTMLElement` fails across iframe realms (parent window vs preview
 * document). Compare against the owning window's constructor instead.
 */
function asHtmlElement(
  node: Element | null | undefined,
  view: Window | null,
): HTMLElement | null {
  if (!node) return null;
  const Ctor = view?.HTMLElement ?? HTMLElement;
  return node instanceof Ctor ? node : null;
}

/**
 * Match Playwright visual suite settle: kill animations/transitions, hide caret,
 * and drop play-function focus rings so live Diff matches chrome-free baselines.
 * Returns a restore function.
 */
function preparePreviewForVisualCapture(doc: Document): () => void {
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

  return () => {
    style.remove();
  };
}

/**
 * Playwright element screenshots include the painted page background behind a
 * transparent subject. html-to-image does not — fill with the preview body's
 * computed background (sampled to rgb so canvas always accepts it).
 */
function resolveCaptureBackground(doc: Document): string {
  const view = doc.defaultView;
  const fallback = "#ffffff";
  if (!view) return fallback;

  const candidates = [doc.body, doc.documentElement];
  let cssColor = "";
  for (const el of candidates) {
    if (!el) continue;
    const bg = view.getComputedStyle(el).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
    cssColor = bg;
    break;
  }
  if (!cssColor) return fallback;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if ((a ?? 0) < 1) return fallback;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return fallback;
  }
}

function resolveCaptureTarget(doc: Document): HTMLElement {
  const view = doc.defaultView;
  const root = asHtmlElement(doc.querySelector("#storybook-root"), view);
  if (!root) {
    throw new Error("#storybook-root not found in preview");
  }
  const portals: HTMLElement[] = [];
  for (const el of doc.querySelectorAll(PORTAL_SELECTORS)) {
    const portal = asHtmlElement(el, view);
    if (!portal) continue;
    if (root.contains(portal)) continue;
    const r = portal.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const style = getComputedStyle(portal);
    if (style.visibility === "hidden" || style.display === "none") continue;
    portals.push(portal);
  }
  if (portals.length === 0) {
    return asHtmlElement(root.firstElementChild, view) ?? root;
  }
  // Capture the root wrapper when portals are open so html-to-image can include
  // in-tree content; portals outside root are drawn via a union clip on body.
  const body = asHtmlElement(doc.body, view);
  if (!body) {
    throw new Error("Preview document body not found");
  }
  return body;
}

/**
 * Capture the story subject (first #storybook-root child, or body when portals
 * are open) — matches Playwright component-clipped baselines.
 */
export async function capturePreviewSubject(): Promise<CaptureResult> {
  const iframe = getPreviewIframe();
  if (!iframe) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) {
    throw new Error("Cannot access preview document (cross-origin or not ready)");
  }

  const restoreCapturePrep = preparePreviewForVisualCapture(doc);
  try {
    await waitTwoFrames();
    await new Promise((r) => setTimeout(r, 50));

    const target = resolveCaptureTarget(doc);
    const rect = target.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));

    try {
      const dataUrl = await toPng(target, {
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio: VISUAL_DEVICE_SCALE_FACTOR,
        backgroundColor: resolveCaptureBackground(doc),
        cacheBust: true,
        skipAutoScale: true,
      });
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
}): Promise<CaptureResult> {
  const iframe = getPreviewIframe();
  if (!iframe) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc?.documentElement || !win) {
    throw new Error("Cannot access preview document (cross-origin or not ready)");
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
      pixelRatio: VISUAL_DEVICE_SCALE_FACTOR,
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
 * Matches Playwright sidecar compare (`fitRgba` in compare-pixels.ts).
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
    img.crossOrigin = "anonymous";
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
