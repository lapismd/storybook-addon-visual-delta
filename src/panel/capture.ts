import { toPng } from "html-to-image";

export type CaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
};

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
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
  const iframe = document.getElementById("storybook-preview-iframe");
  if (!(iframe instanceof HTMLIFrameElement)) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc?.documentElement || !win) {
    throw new Error("Cannot access preview document (cross-origin or not ready)");
  }

  const prev = {
    width: iframe.style.width,
    height: iframe.style.height,
    maxWidth: iframe.style.maxWidth,
    maxHeight: iframe.style.maxHeight,
    minWidth: iframe.style.minWidth,
    minHeight: iframe.style.minHeight,
  };

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

  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.maxWidth = "none";
  iframe.style.maxHeight = "none";
  iframe.style.minWidth = `${width}px`;
  iframe.style.minHeight = `${height}px`;

  try {
    await waitTwoFrames();
    // Allow layout/fonts a beat after resize (matches Playwright settle intent).
    await new Promise((r) => setTimeout(r, 50));

    const dataUrl = await toPng(doc.documentElement, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      cacheBust: true,
      skipAutoScale: true,
    });
    return { dataUrl, width, height };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to capture preview: ${message}`);
  } finally {
    iframe.style.width = prev.width;
    iframe.style.height = prev.height;
    iframe.style.maxWidth = prev.maxWidth;
    iframe.style.maxHeight = prev.maxHeight;
    iframe.style.minWidth = prev.minWidth;
    iframe.style.minHeight = prev.minHeight;
  }
}

/** Fit actual → baseline size without stretching (pad / crop). */
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
  ctx.drawImage(tempCanvas, 0, 0);
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
