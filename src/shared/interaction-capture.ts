/**
 * Shared helpers for opt-in play-step visual captures.
 *
 * Primary baselines remain end-of-play. Interaction PNGs are siblings:
 *   `{slug}--{stepId}-chromium-darwin.png`
 */

/** Query param on iframe.html — park play after this step id. */
export const VISUAL_CAPTURE_UNTIL_PARAM = "visualCaptureUntil";

/**
 * Optional Storybook instrumenter call id to replay through before capture.
 * This lets Visual Delta capture ordinary Interactions rows, not only named
 * `step()` groups handled by `visualCaptureUntil`.
 */
export const VISUAL_CAPTURE_CALL_PARAM = "visualCaptureCall";

/** sessionStorage key — same park signal for live Visual Delta panel remounts. */
export const VISUAL_CAPTURE_UNTIL_SESSION_KEY =
  "storybook-addon-visual-delta/visualCaptureUntil";

/** Set on <html> after each play step completes (slug of the step label). */
export const VISUAL_CAPTURE_STEP_ATTR = "data-visual-capture-step";

/** Set on <html> when play is parked at visualCaptureUntil. */
export const VISUAL_CAPTURE_READY_ATTR = "data-visual-capture-ready";

export type VisualDeltaInteraction = {
  /** Stable slug derived from the play step label. */
  id: string;
  /** Human label from `step("…")`. */
  label: string;
  /** `/visual-baselines/…` URL for the interaction PNG. */
  src: string;
};

/** Slugify a Storybook step label for filenames and query params. */
export function slugifyStepLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Stable, filename-safe id for an ordinary top-level Storybook interaction.
 * Keep the method's casing so the deterministic instrumenter call id can be
 * reconstructed by static comparisons without adding more CSF metadata.
 */
export function interactionIdForInstrumenterCall(
  cursor: number,
  method: string,
): string {
  const safeMethod =
    method
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "call";
  return `interaction-${Math.max(0, Math.trunc(cursor))}-${safeMethod}`;
}

/**
 * Reconstruct Storybook's deterministic top-level call id from an interaction
 * baseline id. Named `step()` baselines intentionally return `null` and keep
 * using the existing runStep park contract.
 */
export function instrumenterCallIdForInteraction(
  storyId: string,
  interactionId: string,
): string | null {
  const match = interactionId.match(/^interaction-(\d+)-([a-zA-Z0-9_-]+)$/);
  if (!match) return null;
  return `${storyId} [${Number(match[1])}] ${match[2]}`;
}

/** Read an exact Storybook instrumenter call target from iframe query params. */
export function readVisualCaptureCall(
  search = typeof location !== "undefined" ? location.search : "",
): string | null {
  try {
    const value = new URLSearchParams(search).get(VISUAL_CAPTURE_CALL_PARAM);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Relative screenshot path (no project/platform suffix) for an interaction.
 * Passed to Playwright `toHaveScreenshot` like the primary path.
 */
export function interactionScreenshotRelativePath(
  primaryRelPng: string,
  stepId: string,
): string {
  if (!primaryRelPng.endsWith(".png")) {
    throw new Error(`Expected .png path, got: ${primaryRelPng}`);
  }
  return primaryRelPng.replace(/\.png$/, `--${stepId}.png`);
}

/** Parse `…/{slug}--{stepId}-chromium-darwin.png` → stepId, or null. */
export function stepIdFromInteractionSnapshotName(
  fileName: string,
  storySlug: string,
): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const prefix = `${storySlug}--`;
  const suffixMatch = base.match(/-chromium-[a-z0-9]+\.png$/i);
  if (!suffixMatch || !base.startsWith(prefix)) return null;
  const withoutSuffix = base.slice(0, -suffixMatch[0].length);
  const stepId = withoutSuffix.slice(prefix.length);
  return stepId || null;
}

/** Read visualCaptureUntil from URL and/or sessionStorage (preview iframe). */
export function readVisualCaptureUntil(
  search = typeof location !== "undefined" ? location.search : "",
): string | null {
  try {
    const value = new URLSearchParams(search).get(VISUAL_CAPTURE_UNTIL_PARAM);
    if (value?.trim()) return value.trim();
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage === "undefined") return null;
    const stored = sessionStorage.getItem(VISUAL_CAPTURE_UNTIL_SESSION_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

/** Set/clear the session park target used by the Visual Delta panel. */
export function setVisualCaptureUntilSession(stepId: string | null): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (stepId?.trim()) {
      sessionStorage.setItem(VISUAL_CAPTURE_UNTIL_SESSION_KEY, stepId.trim());
    } else {
      sessionStorage.removeItem(VISUAL_CAPTURE_UNTIL_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
  notifyVisualCaptureParkWaiters();
}

type ParkWaiter = {
  stepId: string;
  resolve: () => void;
};

const parkWaiters: ParkWaiter[] = [];

function notifyVisualCaptureParkWaiters(): void {
  const until = readVisualCaptureUntil();
  for (let i = parkWaiters.length - 1; i >= 0; i -= 1) {
    const waiter = parkWaiters[i];
    if (!waiter) continue;
    if (until !== waiter.stepId) {
      parkWaiters.splice(i, 1);
      waiter.resolve();
    }
  }
}

/**
 * Pause play while the panel session park targets `stepId`.
 * Resolves when the park target changes or clears (another step / Default /
 * story change) so Interactions UI is not stuck forever.
 */
export function waitWhileSessionParkedAt(stepId: string): Promise<void> {
  if (readVisualCaptureUntil() !== stepId) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    parkWaiters.push({ stepId, resolve });
  });
}
