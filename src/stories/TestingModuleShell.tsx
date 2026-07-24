import React, { useMemo, useState } from "react";
import type { BaselineWriteMode } from "../manager/VisualBaselineSplitButton.js";
import { VisualTestModuleUI } from "../manager/VisualTestModuleUI.js";
import {
  VISUAL_TEST_MODULE_DEFAULTS,
  anyModuleActionSelected,
} from "../manager/visual-test-module-prefs.js";

export type TestingModuleShellProps = {
  /** Global Testing Module vs sidebar context-menu chrome. */
  variant?: "global" | "context";
  /** Seed rewrite mode so Update baselines label is visible. */
  seedRewriteMode?: boolean;
};

/**
 * Catalog harness for the Visual Delta Testing Module checklist (no Storybook API).
 */
export function TestingModuleShell({
  variant = "global",
  seedRewriteMode = false,
}: TestingModuleShellProps) {
  const [runVisualEnabled, setRunVisualEnabled] = useState(
    VISUAL_TEST_MODULE_DEFAULTS.runVisualEnabled,
  );
  const [createBaselinesEnabled, setCreateBaselinesEnabled] = useState(
    VISUAL_TEST_MODULE_DEFAULTS.createBaselinesEnabled,
  );
  const [updateStatusEnabled, setUpdateStatusEnabled] = useState(
    VISUAL_TEST_MODULE_DEFAULTS.updateStatusEnabled,
  );
  const [baselineMode, setBaselineMode] = useState<BaselineWriteMode>(() =>
    seedRewriteMode
      ? "rewrite"
      : VISUAL_TEST_MODULE_DEFAULTS.baselineWriteMode,
  );
  const [statusLine, setStatusLine] = useState<string>("Not run");
  const [lastAction, setLastAction] = useState("none");

  const anyActionSelected = anyModuleActionSelected({
    runVisualEnabled,
    createBaselinesEnabled,
    updateStatusEnabled,
  });

  const selectedSummary = useMemo(() => {
    const parts: string[] = [];
    if (runVisualEnabled) parts.push("compare");
    if (createBaselinesEnabled) {
      parts.push(baselineMode === "rewrite" ? "update-baselines" : "create-missing");
    }
    if (updateStatusEnabled) parts.push("update-status");
    return parts.join("+") || "none";
  }, [
    baselineMode,
    createBaselinesEnabled,
    runVisualEnabled,
    updateStatusEnabled,
  ]);

  return (
    <div data-testid="testing-module-shell" style={{ maxWidth: 360 }}>
      <VisualTestModuleUI
        variant={variant}
        statusLine={anyActionSelected ? statusLine : "Select at least one action"}
        runVisualEnabled={runVisualEnabled}
        createBaselinesEnabled={createBaselinesEnabled}
        updateStatusEnabled={updateStatusEnabled}
        baselineMode={baselineMode}
        runnerBusy={false}
        anyActionSelected={anyActionSelected}
        compareChipStatus="unknown"
        compareChipLabel="Run tests to see results"
        compareChipCount={null}
        compareChipDisabled
        baselineChipStatus="unknown"
        baselineChipTooltip={
          baselineMode === "rewrite"
            ? "Update baselines (mock)"
            : "Create missing Baselines (mock)"
        }
        statusChipStatus="unknown"
        statusChipLabel={null}
        isWritingBaselines={false}
        isUpdatingStatus={false}
        isCompareRunning={false}
        onRunVisualChange={setRunVisualEnabled}
        onCreateBaselinesChange={setCreateBaselinesEnabled}
        onUpdateStatusChange={setUpdateStatusEnabled}
        onBaselineModeChange={setBaselineMode}
        onRun={() => {
          setLastAction(selectedSummary);
          setStatusLine(`Mock ran ${selectedSummary}`);
        }}
        onStop={() => {
          setLastAction("stop");
          setStatusLine("Stopped");
        }}
        onOpenCompareResults={() => setLastAction("open-compare")}
        onOpenBaselineStatus={() => setLastAction("open-baselines")}
        onOpenStatusResults={() => setLastAction("open-status")}
      />
      <div data-testid="testing-module-meta" style={{ display: "none" }}>
        <span data-testid="fixture-selected">{selectedSummary}</span>
        <span data-testid="fixture-last-action">{lastAction}</span>
        <span data-testid="fixture-baseline-mode">{baselineMode}</span>
      </div>
    </div>
  );
}
