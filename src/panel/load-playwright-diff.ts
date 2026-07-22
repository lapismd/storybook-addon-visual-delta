import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import type { DiffResultData } from "../types.js";
import { loadImage } from "./capture.js";
import { buildFocusAssets } from "./diff-assets.js";

const VISUAL_BASELINES_PREFIX = "/visual-baselines/";

function baselineStem(baselineSrc: string): string | null {
  const pathOnly = baselineSrc.split("?")[0] ?? baselineSrc;
  if (!/\.png$/i.test(pathOnly)) return null;
  return pathOnly.replace(/\.png$/i, "");
}

function publicUrl(rel: string, cacheBust: number): string {
  const cleaned = rel.replace(/^\/+/, "");
  return `${VISUAL_BASELINES_PREFIX}${cleaned}?t=${cacheBust}`;
}

async function fetchSidecar(url: string): Promise<VisualDiffSidecar | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as VisualDiffSidecar;
    if (data?.version !== 1 || !data.storyId) return null;
    return data;
  } catch {
    return null;
  }
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
    // Some static servers omit HEAD — fall back to a ranged GET.
    const get = await fetch(url, {
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

/**
 * Load a Playwright visual-run compare into panel `DiffResultData` when
 * ephemeral `.json` / `.actual.png` / `.diff.png` artifacts exist beside the
 * selected baseline under `/visual-baselines`.
 */
export async function loadPlaywrightDiffResult(
  baselineSrc: string,
  cacheBust = Date.now(),
): Promise<DiffResultData | null> {
  const stem = baselineStem(baselineSrc);
  if (!stem) return null;

  const sidecar = await fetchSidecar(`${stem}.json?t=${cacheBust}`);
  if (!sidecar) return null;

  const actualSrc = sidecar.actualRel
    ? publicUrl(sidecar.actualRel, cacheBust)
    : `${stem}.actual.png?t=${cacheBust}`;
  const diffSrc = sidecar.diffRel
    ? publicUrl(sidecar.diffRel, cacheBust)
    : `${stem}.diff.png?t=${cacheBust}`;

  const [hasActual, hasDiff] = await Promise.all([
    urlExists(actualSrc),
    urlExists(diffSrc),
  ]);
  if (!hasActual || !hasDiff) return null;

  const baselineUrl = `${stem}.png?t=${cacheBust}`;
  const [baseline, actual, diff] = await Promise.all([
    loadImage(baselineUrl),
    loadImage(actualSrc),
    loadImage(diffSrc),
  ]);

  const width = sidecar.imageWidth ?? baseline.width;
  const height = sidecar.imageHeight ?? baseline.height;
  const { focusDataUrl, changeBounds } = buildFocusAssets(
    actual.imageData.data,
    diff.imageData.data,
    actual.width,
    actual.height,
  );

  const diffPixels = sidecar.diffPixels ?? 0;
  const totalPixels = sidecar.totalPixels ?? width * height;
  const diffPercent =
    sidecar.diffPercent ??
    (totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0);
  const passThresholdPercent = sidecar.passThresholdPercent ?? 1;
  const passed =
    sidecar.passed ??
    (sidecar.status === "passed" || diffPercent < passThresholdPercent);

  return {
    actualImage: actual.dataUrl,
    diffImage: diff.dataUrl,
    baselineImage: baseline.dataUrl,
    focusImage: focusDataUrl,
    changeBounds: sidecar.changeBounds ?? changeBounds,
    imageWidth: width,
    imageHeight: height,
    diffPixels,
    totalPixels,
    diffPercent,
    passThresholdPercent,
    passed,
    diffHistogram: sidecar.diffHistogram ?? [],
  };
}
