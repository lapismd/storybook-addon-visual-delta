import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  DEFAULT_PLACEMENT,
  isSplitPlacement,
  normalizePlacement,
  type PlacementMode,
} from "../constants.js";

export const SETTINGS_STORAGE_KEY = "storybook-addon-visual-delta/settings";

/** Live Diff pass threshold, keyed by capture engine. */
export type PassThresholdByEngine = {
  html: number;
  chromium: number;
};

export type VisualDeltaSettings = {
  /** Whether a baseline overlay is shown (gallery thumb selected). */
  overlayOn: boolean;
  placement: PlacementMode;
  opacity: number;
  colorInversion: boolean;
  /**
   * When false, hide the live story and show only the baseline image
   * (center overlay). Default true = live visible.
   */
  liveVisible: boolean;
  /** Pass threshold (%) for Diff HTML vs Diff Browser. */
  passThresholdByEngine: PassThresholdByEngine;
};

export const DEFAULT_SETTINGS: VisualDeltaSettings = {
  overlayOn: true,
  placement: DEFAULT_PLACEMENT,
  opacity: 1,
  colorInversion: false,
  liveVisible: true,
  passThresholdByEngine: {
    html: 1,
    chromium: DEFAULT_PASS_THRESHOLD_PERCENT,
  },
};

function readThreshold(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function loadPassThresholdByEngine(
  parsed: Partial<VisualDeltaSettings> & { passThresholdPercent?: unknown },
): PassThresholdByEngine {
  const defaults = DEFAULT_SETTINGS.passThresholdByEngine;
  const byEngine = parsed.passThresholdByEngine;
  if (byEngine && typeof byEngine === "object") {
    return {
      html: readThreshold(byEngine.html, defaults.html),
      chromium: readThreshold(byEngine.chromium, defaults.chromium),
    };
  }
  // Migrate pre–per-engine `passThresholdPercent` to both engines.
  const legacy = readThreshold(parsed.passThresholdPercent, defaults.html);
  return { html: legacy, chromium: legacy };
}

function cloneDefaults(): VisualDeltaSettings {
  return {
    ...DEFAULT_SETTINGS,
    passThresholdByEngine: { ...DEFAULT_SETTINGS.passThresholdByEngine },
  };
}

export function loadSettings(): VisualDeltaSettings {
  if (typeof localStorage === "undefined") return cloneDefaults();
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as Partial<VisualDeltaSettings> & {
      passThresholdPercent?: unknown;
    };
    const placement = normalizePlacement(parsed.placement);
    const opacity =
      typeof parsed.opacity === "number" &&
      Number.isFinite(parsed.opacity) &&
      parsed.opacity >= 0 &&
      parsed.opacity <= 1
        ? parsed.opacity
        : isSplitPlacement(placement)
          ? 1
          : 0.5;
    return {
      overlayOn:
        typeof parsed.overlayOn === "boolean"
          ? parsed.overlayOn
          : DEFAULT_SETTINGS.overlayOn,
      placement,
      opacity,
      colorInversion:
        typeof parsed.colorInversion === "boolean"
          ? parsed.colorInversion
          : DEFAULT_SETTINGS.colorInversion,
      liveVisible:
        typeof parsed.liveVisible === "boolean"
          ? parsed.liveVisible
          : DEFAULT_SETTINGS.liveVisible,
      passThresholdByEngine: loadPassThresholdByEngine(parsed),
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveSettings(settings: VisualDeltaSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
}

export function clearSettings(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
