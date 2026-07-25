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
  /** Demo live progress under checkboxes + streamed title line. */
  seedRunningProgress?: boolean;
};

/**
 * Catalog harness for the Visual Delta Testing Module checklist (no Storybook API).
 */
export function TestingModuleShell({
  variant = "global",
  seedRewriteMode = false,
  seedRunningProgress = false,
}: TestingModuleShellProps) {
  const [runVisualEnabled, setRunVisualEnabled] = useState<boolean>(
    VISUAL_TEST_MODULE_DEFAULTS.runVisualEnabled,
  );
  const [createBaselinesEnabled, setCreateBaselinesEnabled] = useState<boolean>(
    seedRunningProgress
      ? true
      : VISUAL_TEST_MODULE_DEFAULTS.createBaselinesEnabled,
  );
  const [updateStatusEnabled, setUpdateStatusEnabled] = useState<boolean>(
    seedRunningProgress
      ? true
      : VISUAL_TEST_MODULE_DEFAULTS.updateStatusEnabled,
  );
  const [rebuildStaticEnabled, setRebuildStaticEnabled] = useState<boolean>(
    VISUAL_TEST_MODULE_DEFAULTS.rebuildStaticEnabled,
  );
  const [baselineMode, setBaselineMode] = useState<BaselineWriteMode>(() =>
    seedRewriteMode
      ? "rewrite"
      : VISUAL_TEST_MODULE_DEFAULTS.baselineWriteMode,
  );
  const [statusLine, setStatusLine] = useState<string>(
    seedRunningProgress
      ? "✓ shadcn-disclosure-accordion--opens-a-section (1/2)"
      : "Not run",
  );
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
        rebuildStaticEnabled={rebuildStaticEnabled}
        baselineMode={baselineMode}
        runnerBusy={seedRunningProgress}
        anyActionSelected={anyActionSelected}
        compareChipStatus={seedRunningProgress ? "warning" : "unknown"}
        compareChipLabel={
          seedRunningProgress ? "Testing... 1/2" : "Run tests to see results"
        }
        compareChipCount={null}
        compareChipDisabled={!seedRunningProgress}
        baselineChipStatus={seedRunningProgress ? "warning" : "unknown"}
        baselineChipTooltip={
          baselineMode === "rewrite"
            ? "Update baselines (mock)"
            : "Create missing Baselines (mock)"
        }
        statusChipStatus={seedRunningProgress ? "warning" : "unknown"}
        statusChipLabel={null}
        compareRowProgress={seedRunningProgress ? "1/2" : null}
        baselineRowProgress={seedRunningProgress ? "1/1" : null}
        statusRowProgress={seedRunningProgress ? "0/2" : null}
        isWritingBaselines={seedRunningProgress}
        isUpdatingStatus={seedRunningProgress}
        isCompareRunning={seedRunningProgress}
        onRunVisualChange={setRunVisualEnabled}
        onCreateBaselinesChange={setCreateBaselinesEnabled}
        onUpdateStatusChange={setUpdateStatusEnabled}
        onRebuildStaticChange={setRebuildStaticEnabled}
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
