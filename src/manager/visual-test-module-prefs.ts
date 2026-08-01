import {
  loadBaselineWriteMode,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";

export const RUN_VISUAL_KEY =
  "storybook-addon-visual-delta/run-visual-enabled-v1";
export const RUN_DIFF_KEY = "storybook-addon-visual-delta/run-diff-enabled-v1";
export const CREATE_BASELINES_KEY =
  "storybook-addon-visual-delta/create-baselines-enabled-v1";
export const UPDATE_STATUS_KEY =
  "storybook-addon-visual-delta/update-status-enabled-v1";
export const AFFECTED_ONLY_KEY =
  "storybook-addon-visual-delta/affected-only-enabled-v1";

/** Defaults for Testing Module checkboxes / baseline write mode. */
export const VISUAL_TEST_MODULE_DEFAULTS = {
  runVisualEnabled: true,
  /** Selected-browser compare + optional clean-matrix Accept. */
  runDiffEnabled: false,
  /** Create/Update baselines row — off until explicitly enabled. */
  createBaselinesEnabled: false,
  updateStatusEnabled: false,
  /** Global compare runs use the disposable affected cache by default. */
  affectedOnlyEnabled: true,
  /** Baseline write mode when the baselines row is enabled. */
  baselineWriteMode: "create" as BaselineWriteMode,
} as const;

export function readBoolFlag(key: string, defaultValue: boolean): boolean {
  if (typeof localStorage === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

export function writeBoolFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadRunVisualEnabled(): boolean {
  return readBoolFlag(
    RUN_VISUAL_KEY,
    VISUAL_TEST_MODULE_DEFAULTS.runVisualEnabled,
  );
}

export function loadRunDiffEnabled(): boolean {
  return readBoolFlag(RUN_DIFF_KEY, VISUAL_TEST_MODULE_DEFAULTS.runDiffEnabled);
}

export function loadCreateBaselinesEnabled(): boolean {
  return readBoolFlag(
    CREATE_BASELINES_KEY,
    VISUAL_TEST_MODULE_DEFAULTS.createBaselinesEnabled,
  );
}

export function loadUpdateStatusEnabled(): boolean {
  return readBoolFlag(
    UPDATE_STATUS_KEY,
    VISUAL_TEST_MODULE_DEFAULTS.updateStatusEnabled,
  );
}

export function loadAffectedOnlyEnabled(): boolean {
  return readBoolFlag(
    AFFECTED_ONLY_KEY,
    VISUAL_TEST_MODULE_DEFAULTS.affectedOnlyEnabled,
  );
}

/** Persisted baseline mode, falling back to Create missing. */
export function loadModuleBaselineWriteMode(): BaselineWriteMode {
  const mode = loadBaselineWriteMode();
  return mode === "rewrite" ? "rewrite" : "create";
}

export function anyModuleActionSelected(flags: {
  runVisualEnabled: boolean;
  runDiffEnabled?: boolean;
  createBaselinesEnabled: boolean;
  updateStatusEnabled: boolean;
}): boolean {
  return (
    flags.runVisualEnabled ||
    Boolean(flags.runDiffEnabled) ||
    flags.createBaselinesEnabled ||
    flags.updateStatusEnabled
  );
}
