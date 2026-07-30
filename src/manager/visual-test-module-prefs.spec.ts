import { afterEach, describe, expect, it } from "vitest";
import {
  AFFECTED_ONLY_KEY,
  CREATE_BASELINES_KEY,
  RUN_DIFF_KEY,
  RUN_VISUAL_KEY,
  UPDATE_STATUS_KEY,
  VISUAL_TEST_MODULE_DEFAULTS,
  anyModuleActionSelected,
  loadAffectedOnlyEnabled,
  loadCreateBaselinesEnabled,
  loadModuleBaselineWriteMode,
  loadRunDiffEnabled,
  loadRunVisualEnabled,
  loadUpdateStatusEnabled,
  writeBoolFlag,
} from "./visual-test-module-prefs.js";

const MODE_KEY = "storybook-addon-visual-delta/baseline-write-mode-v1";

afterEach(() => {
  localStorage.removeItem(RUN_VISUAL_KEY);
  localStorage.removeItem(RUN_DIFF_KEY);
  localStorage.removeItem(CREATE_BASELINES_KEY);
  localStorage.removeItem(UPDATE_STATUS_KEY);
  localStorage.removeItem(AFFECTED_ONLY_KEY);
  localStorage.removeItem(MODE_KEY);
});

describe("visual test module prefs", () => {
  it("defaults: Run visual on, Run Diff off, baselines off, Update status off, Create missing mode", () => {
    expect(VISUAL_TEST_MODULE_DEFAULTS).toEqual({
      runVisualEnabled: true,
      runDiffEnabled: false,
      createBaselinesEnabled: false,
      affectedOnlyEnabled: true,
      updateStatusEnabled: false,
      baselineWriteMode: "create",
    });
    expect(loadRunVisualEnabled()).toBe(true);
    expect(loadRunDiffEnabled()).toBe(false);
    expect(loadCreateBaselinesEnabled()).toBe(false);
    expect(loadUpdateStatusEnabled()).toBe(false);
    expect(loadAffectedOnlyEnabled()).toBe(true);
    expect(loadModuleBaselineWriteMode()).toBe("create");
  });

  it("persists checkbox flags", () => {
    writeBoolFlag(CREATE_BASELINES_KEY, true);
    writeBoolFlag(UPDATE_STATUS_KEY, true);
    writeBoolFlag(AFFECTED_ONLY_KEY, false);
    writeBoolFlag(RUN_VISUAL_KEY, false);
    writeBoolFlag(RUN_DIFF_KEY, true);
    expect(loadCreateBaselinesEnabled()).toBe(true);
    expect(loadUpdateStatusEnabled()).toBe(true);
    expect(loadAffectedOnlyEnabled()).toBe(false);
    expect(loadRunVisualEnabled()).toBe(false);
    expect(loadRunDiffEnabled()).toBe(true);
  });

  it("treats unknown baseline mode as create", () => {
    localStorage.setItem(MODE_KEY, "nope");
    expect(loadModuleBaselineWriteMode()).toBe("create");
  });

  it("anyModuleActionSelected requires at least one flag", () => {
    expect(
      anyModuleActionSelected({
        runVisualEnabled: false,
        runDiffEnabled: false,
        createBaselinesEnabled: false,
        updateStatusEnabled: false,
      }),
    ).toBe(false);
    expect(
      anyModuleActionSelected({
        runVisualEnabled: false,
        runDiffEnabled: true,
        createBaselinesEnabled: false,
        updateStatusEnabled: false,
      }),
    ).toBe(true);
    expect(
      anyModuleActionSelected({
        runVisualEnabled: false,
        createBaselinesEnabled: true,
        updateStatusEnabled: false,
      }),
    ).toBe(true);
  });
});
