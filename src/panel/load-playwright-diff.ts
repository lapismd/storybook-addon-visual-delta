import {
  isVisualDiffSidecar,
  type VisualDiffSidecar,
} from "../visual-diff-sidecar.js";
import type { DiffResultData } from "../types.js";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  VISUAL_DEVICE_SCALE_FACTOR,
  VISUAL_VIEWPORT,
} from "../constants.js";
import { loadImage } from "./capture.js";
import { buildFocusAssets } from "./diff-assets.js";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import { formatPlaywrightCaptureDiagnostics } from "./capture-diagnostics.js";

const VISUAL_BASELINES_PREFIX = "/visual-baselines/";
const VISUAL_ARTIFACTS_PREFIX = "/visual-delta-artifacts/";

function baselineStem(baselineSrc: string): string | null {
  const pathOnly = baselineSrc.split("?")[0] ?? baselineSrc;
  if (!/\.png$/i.test(pathOnly)) return null;
  return pathOnly.replace(/\.png$/i, "");
}

function publicUrl(rel: string, cacheBust: number): string {
  const cleaned = rel.replace(/^\/+/, "");
  return `${VISUAL_ARTIFACTS_PREFIX}${cleaned}?t=${cacheBust}`;
}

function artifactStem(baselineSrc: string): string | null {
  const pathOnly = baselineSrc.split("?")[0] ?? baselineSrc;
  if (!pathOnly.startsWith(VISUAL_BASELINES_PREFIX) || !/\.png$/i.test(pathOnly)) {
    return null;
  }
  return `${VISUAL_ARTIFACTS_PREFIX}${pathOnly
    .slice(VISUAL_BASELINES_PREFIX.length)
    .replace(/\.png$/i, "")}`;
}

async function fetchSidecar(url: string): Promise<VisualDiffSidecar | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const data = (await response.json()) as unknown;
    return isVisualDiffSidecar(data) ? data : null;
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

async function sha256Url(url: string): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok || typeof response.arrayBuffer !== "function") return null;
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Load a Playwright visual-run compare into panel `DiffResultData` when
 * `.result.json` / `.actual.png` / `.diff.png` artifacts exist under the
 * mirrored `/visual-delta-artifacts` path for the selected baseline.
 */
export async function loadPlaywrightDiffResult(
  baselineSrc: string,
  cacheBust = Date.now(),
): Promise<DiffResultData | null> {
  const stem = baselineStem(baselineSrc);
  const derivedStem = artifactStem(baselineSrc);
  if (!stem || !derivedStem) return null;

  const sidecar = await fetchSidecar(`${derivedStem}.result.json?t=${cacheBust}`);
  if (
    !sidecar ||
    sidecar.version !== 4 ||
    !sidecar.baselineHash ||
    !sidecar.actualHash ||
    !sidecar.captureConfigHash ||
    !sidecar.captureOperationId ||
    !sidecar.actualCapturedAt ||
    !sidecar.renderFingerprint ||
    !sidecar.variant ||
    !sidecar.captureSet?.length ||
    JSON.stringify(sidecar.captureProfile) !==
      JSON.stringify(CANONICAL_VISUAL_CAPTURE_PROFILE)
  ) {
    return null;
  }
  const currentHash = await sha256Url(`${stem}.png?t=${cacheBust}`);
  if (currentHash !== sidecar.baselineHash) return null;

  const derivedRelativeStem = derivedStem.slice(VISUAL_ARTIFACTS_PREFIX.length);
  const expectedActualRel = `${derivedRelativeStem}.actual.png`;
  const expectedDiffRel = `${derivedRelativeStem}.diff.png`;
  if (
    sidecar.actualRel !== expectedActualRel ||
    sidecar.diffRel !== expectedDiffRel ||
    !sidecar.captureSet.some(
      (member) =>
        member.baselineRelative === `${derivedRelativeStem}.png` &&
        member.variant.kind === sidecar.variant?.kind &&
        (member.variant.kind === "primary" ||
          (sidecar.variant?.kind !== "primary" &&
            member.variant.id === sidecar.variant?.id)),
    )
  ) {
    return null;
  }
  const actualSrc = publicUrl(expectedActualRel, cacheBust);
  const diffSrc = publicUrl(expectedDiffRel, cacheBust);

  const [hasActual, hasDiff] = await Promise.all([
    urlExists(actualSrc),
    urlExists(diffSrc),
  ]);
  if (!hasActual || !hasDiff) return null;

  const baselineUrl = `${stem}.png?t=${cacheBust}`;
  const [actualHash, baseline, actual, diff] = await Promise.all([
    sha256Url(actualSrc),
    loadImage(baselineUrl),
    loadImage(actualSrc),
    loadImage(diffSrc),
  ]);
  if (
    actualHash !== sidecar.actualHash ||
    sidecar.capturedWidth !== actual.width ||
    sidecar.capturedHeight !== actual.height
  ) {
    return null;
  }

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
  const passThresholdPercent =
    sidecar.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
  const passed =
    sidecar.outcome === "passed" ||
    sidecar.outcome === "changed-within-tolerance" ||
    (sidecar.outcome == null &&
      (sidecar.passed ??
        (sidecar.status === "passed" && diffPercent < passThresholdPercent)));
  const deviceScaleFactor =
    sidecar.deviceScaleFactor ?? VISUAL_DEVICE_SCALE_FACTOR;
  const captureViewport = sidecar.viewport ?? VISUAL_VIEWPORT;

  return {
    source: "playwright",
    baselineHash: sidecar.baselineHash,
    captureConfigHash: sidecar.captureConfigHash,
    operationId: sidecar.operationId,
    actualImage: actual.dataUrl,
    diffImage: diff.dataUrl,
    baselineImage: baseline.dataUrl,
    focusImage: focusDataUrl,
    changeBounds: sidecar.changeBounds ?? changeBounds,
    imageWidth: width,
    imageHeight: height,
    cssWidth: width / deviceScaleFactor,
    cssHeight: height / deviceScaleFactor,
    deviceScaleFactor,
    captureViewport,
    observedCaptureViewport: captureViewport,
    capturedBitmap: {
      width: sidecar.capturedWidth ?? actual.width,
      height: sidecar.capturedHeight ?? actual.height,
    },
    sizeNote:
      formatPlaywrightCaptureDiagnostics({
        ...sidecar,
        viewport: captureViewport,
        deviceScaleFactor,
        capturedWidth: actual.width,
        capturedHeight: actual.height,
      }) ?? undefined,
    diffPixels,
    totalPixels,
    diffPercent,
    passThresholdPercent,
    passed,
    diffHistogram: sidecar.diffHistogram ?? [],
  };
}
