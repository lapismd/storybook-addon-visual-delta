import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  DEFAULT_PLACEMENT,
  isSplitPlacement,
  normalizePlacement,
  type PlacementMode,
} from "../constants.js";

export const SETTINGS_STORAGE_KEY = "storybook-addon-visual-delta/settings";

export type VisualDeltaSettings = {
  /** Whether a baseline overlay is shown (gallery thumb selected). */
  overlayOn: boolean;
  placement: PlacementMode;
  opacity: number;
  colorInversion: boolean;
  passThresholdPercent: number;
};

export const DEFAULT_SETTINGS: VisualDeltaSettings = {
  overlayOn: true,
  placement: DEFAULT_PLACEMENT,
  opacity: 1,
  colorInversion: false,
  passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT,
};

export function loadSettings(): VisualDeltaSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VisualDeltaSettings>;
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
    const passThresholdPercent =
      typeof parsed.passThresholdPercent === "number" &&
      Number.isFinite(parsed.passThresholdPercent)
        ? parsed.passThresholdPercent
        : DEFAULT_SETTINGS.passThresholdPercent;
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
      passThresholdPercent,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
