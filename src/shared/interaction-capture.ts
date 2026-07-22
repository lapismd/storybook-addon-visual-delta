/**
 * Shared helpers for opt-in play-step visual captures.
 *
 * Primary baselines remain end-of-play. Interaction PNGs are siblings:
 *   `{slug}--{stepId}-chromium-darwin.png`
 */

/** Query param on iframe.html — park play after this step id. */
export const VISUAL_CAPTURE_UNTIL_PARAM = "visualCaptureUntil";

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
}
