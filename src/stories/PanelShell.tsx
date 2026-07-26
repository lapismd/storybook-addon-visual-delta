import React, { useCallback, useMemo, useState } from "react";
import type {
  BaselineGeometryMismatch,
  PlacementMode,
  VisualDeltaImage,
  VisualReviewStatus,
} from "../constants.js";
import {
  loadDiffCaptureEngine,
  type DiffCaptureEngine,
} from "../manager/DiffCaptureSplitButton.js";
import type { VisualRunMode } from "../manager/VisualRunSplitButton.js";
import { BaselineAccordion } from "../panel/BaselineAccordion.js";
import { BaselineGeometryWarning } from "../panel/BaselineGeometryWarning.js";
import { ConfigurationPanel } from "../panel/ConfigurationPanel.js";
import { ImageGallery } from "../panel/ImageGallery.js";
import { LiveVisibilityToggle } from "../panel/LiveVisibilityToggle.js";
import {
  PanelResultSummary,
  type PanelResultState,
} from "../panel/PanelResultSummary.js";
import { PanelView } from "../panel/PanelView.js";
import { PlacementPad } from "../panel/PlacementPad.js";
import { ModeSelector } from "../panel/ModeSelector.js";
import {
  ErrorText,
  Toolbar as PanelToolbar,
  ToolbarRow,
} from "../panel/styled.js";
import { placementToggleAction } from "../shared/overlay-session.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import type { VisualModeResultStatus } from "../shared/mode-results.js";
import { FormPlaceholder } from "./FormPlaceholder.js";
import {
  createMockVisualBackend,
  type MockVisualBackend,
} from "./mock-visual-backend.js";

const DEMO_STORY_ID = "visual-delta-panel-shell--overview";

const SAMPLE_IMAGES: VisualDeltaImage[] = [
  {
    src:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" fill="#5c6bc0"/><text x="12" y="30" fill="#fff" font-size="14">A</text></svg>`,
      ),
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
  {
    src:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" fill="#00897b"/><text x="12" y="30" fill="#fff" font-size="14">B</text></svg>`,
      ),
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
];

const SAMPLE_CONFIG: VisualDeltaResolvedConfig = {
  ok: true,
  options: {
    root: "/workspace/ui",
    snapshotDir: "/workspace/ui/tests/visual/storybook.spec.ts-snapshots",
    baselinePathMode: "nested-import",
    visualServerPort: 9010,
    allowRebuild: true,
    visualUpdateArgs: ["visual-delta", "update"],
    visualInteractionUpdateArgs: ["visual-delta", "interaction-update"],
    visualTestArgs: ["playwright", "test"],
    addonSrcDir: "packages/storybook-addon-visual-delta/src",
  },
  playwrightPassThresholdPercent: 1,
  projectDefaults: BUILTIN_VISUAL_DELTA_DEFAULTS,
  projectDefaultSources: {
    passThresholdPercent: "project",
    diffThreshold: "built-in",
    diffIncludeAntiAliasing: "built-in",
    delay: "built-in",
    cropToViewport: "built-in",
    placement: "built-in",
    opacity: "built-in",
    baselineLabelOffset: "built-in",
    previewSplitZoomDefault: "built-in",
    diffResultZoomDefault: "built-in",
  },
  projectConfigPath: "/workspace/ui/.visual-delta/config.json",
  projectConfigExists: true,
  onboarding: {
    suiteReady: true,
    playwrightConfigReady: true,
    snapshotDirExists: true,
    ready: true,
    hint: "Visual Delta is ready.",
  },
  diagnostics: [
    {
      code: "static-baseline-mount",
      severity: "info",
      setting: "snapshotDir",
      message: "Snapshot directory is mounted at /visual-baselines.",
    },
  ],
  warnings: ["Snapshot directory is mounted at /visual-baselines."],
};

export type PanelShellProps = {
  /** Injected backend (tests/stories share one instance for assertions). */
  backend?: MockVisualBackend;
  /** Start with no baselines so the Create visual CTA is shown. */
  seedEmpty?: boolean;
  initialState?: PanelResultState;
  initialSkipVisual?: boolean;
  configurationOpen?: boolean;
  /** Deterministic configuration persistence failure for regression stories. */
  configurationSaveError?: string;
  captureError?: string;
  runAvailable?: boolean;
  modeNames?: string[];
  modeResults?: Record<string, VisualModeResultStatus>;
  /** Deterministic in-flight counts for progress-chrome stories. */
  initialProgress?: { completed: number; total: number };
  /** Deterministic streamed output kept behind the progress-log control. */
  initialStatusLog?: string;
  /** Component baseline/live bounds mismatch reported by the preview. */
  baselineGeometryMismatch?: BaselineGeometryMismatch | null;
};

/**
 * Catalog harness that looks like the live Visual Delta panel and drives
 * create/update/run/review through an in-memory mock backend.
 */
export function PanelShell({
  backend: backendProp,
  seedEmpty = false,
  initialState = "ready",
  initialSkipVisual = false,
  configurationOpen = false,
  configurationSaveError,
  captureError = "",
  runAvailable = true,
  modeNames = [],
  modeResults = {},
  initialProgress,
  initialStatusLog = "",
  baselineGeometryMismatch = null,
}: PanelShellProps) {
  const backend = useMemo(
    () => backendProp ?? createMockVisualBackend(),
    [backendProp],
  );

  const [images, setImages] = useState<VisualDeltaImage[]>(
    seedEmpty ? [] : SAMPLE_IMAGES,
  );
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<PlacementMode>("right");
  const [overlayOn, setOverlayOn] = useState(true);
  const [liveVisible, setLiveVisible] = useState(true);
  const [reviewStatus, setReviewStatus] = useState<VisualReviewStatus | null>(
    null,
  );
  const [skipVisual, setSkipVisual] = useState(initialSkipVisual);
  const [badgeStatus, setBadgeStatus] = useState<"pass" | "fail" | null>(null);
  const [diffResult, setDiffResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [diffEngine, setDiffEngine] = useState<DiffCaptureEngine>(() =>
    loadDiffCaptureEngine(),
  );
  const [diffProgressLabel, setDiffProgressLabel] = useState<string | null>(
    null,
  );
  const [runProgressLabel, setRunProgressLabel] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState(initialProgress ?? null);
  const [statusLog, setStatusLog] = useState(initialStatusLog);
  const [expandedId, setExpandedId] = useState<"default" | string | null>(
    "default",
  );
  const [showDistribution, setShowDistribution] = useState(false);
  const [interactionSteps, setInteractionSteps] = useState<
    Array<{ id: string; label: string }>
  >([{ id: "opens-chooser", label: "Opens chooser" }]);

  const [actionLog, setActionLog] = useState<string>("");
  const [interactionStepLabel, setInteractionStepLabel] = useState("none");
  const [acceptScope, setAcceptScope] = useState("none");
  const [showConfiguration, setShowConfiguration] = useState(configurationOpen);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const recordActions = useCallback(() => {
    setActionLog(backend.actions.join(","));
    setInteractionStepLabel(backend.lastInteractionStep ?? "none");
  }, [backend]);

  const appendLog = useCallback((chunk: string) => {
    setStatusLog((prev) => `${prev}${chunk}`);
  }, []);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setRunProgressLabel("Creating…");
    try {
      const log = await backend.createBaseline(DEMO_STORY_ID);
      appendLog(log);
      setImages(SAMPLE_IMAGES);
      setBadgeStatus("pass");
      recordActions();
    } finally {
      setBusy(false);
      setRunProgressLabel(null);
    }
  }, [appendLog, backend, recordActions]);

  const handleUpdate = useCallback(async () => {
    setBusy(true);
    setRunProgressLabel("Updating…");
    try {
      const log = await backend.updateBaseline(DEMO_STORY_ID);
      appendLog(log);
      setBadgeStatus("pass");
      recordActions();
    } finally {
      setBusy(false);
      setRunProgressLabel(null);
    }
  }, [appendLog, backend, recordActions]);

  const handleRebuildStatic = useCallback(async () => {
    setBusy(true);
    setIsRebuilding(true);
    setRunProgressLabel("Rebuilding static…");
    try {
      const log = await backend.rebuildStatic();
      appendLog(log);
      recordActions();
    } finally {
      setBusy(false);
      setIsRebuilding(false);
      setRunProgressLabel(null);
    }
  }, [appendLog, backend, recordActions]);

  const handleDiff = useCallback(
    (engine: DiffCaptureEngine) => {
      backend.actions.push("diff");
      setIsDiffing(true);
      setDiffProgressLabel(engine === "chromium" ? "Capturing…" : "Diffing…");
      setDiffResult(
        engine === "chromium"
          ? "Live Diff Chromium: 0.0000% (mock)"
          : "Live Diff HTML: 0.0000% (mock)",
      );
      setBadgeStatus("pass");
      recordActions();
      window.setTimeout(() => {
        setIsDiffing(false);
        setDiffProgressLabel(null);
      }, 0);
    },
    [backend, recordActions],
  );

  const handleRun = useCallback(
    async (mode: VisualRunMode) => {
      setIsRunning(true);
      setRunProgress({ completed: 0, total: 0 });
      setRunProgressLabel(mode === "all" ? "Testing all…" : "Testing…");
      try {
        for await (const chunk of backend.runTests([DEMO_STORY_ID])) {
          appendLog(chunk);
          try {
            const event = JSON.parse(chunk.trim()) as {
              type?: string;
              completed?: number;
              total?: number;
            };
            if (event.type === "start" && event.total != null) {
              setRunProgress({ completed: 0, total: event.total });
            }
            if (event.type === "progress" && event.completed != null) {
              setRunProgress({
                completed: event.completed,
                total: event.total ?? 0,
              });
              setRunProgressLabel(
                `Testing… ${event.completed}/${event.total ?? "?"}`,
              );
            }
          } catch {
            /* not JSON line */
          }
        }
        setBadgeStatus("pass");
        recordActions();
      } finally {
        setIsRunning(false);
        setRunProgress(null);
        setRunProgressLabel(null);
      }
    },
    [appendLog, backend, recordActions],
  );

  const handleStopRun = useCallback(async () => {
    await backend.cancelTests();
    setIsRunning(false);
    setRunProgress(null);
    setRunProgressLabel(null);
    recordActions();
  }, [backend, recordActions]);

  const handleStopDiff = useCallback(() => {
    setIsDiffing(false);
    setDiffProgressLabel(null);
    recordActions();
  }, [recordActions]);

  const handleReview = useCallback(
    async (status: VisualReviewStatus) => {
      await backend.reviewStatus(DEMO_STORY_ID, status);
      setReviewStatus(status);
      recordActions();
    },
    [backend, recordActions],
  );

  const handleToggleSkipVisual = useCallback(async () => {
    const next = !skipVisual;
    await backend.skipVisual(DEMO_STORY_ID, next);
    setSkipVisual(next);
    if (next) setReviewStatus(null);
    recordActions();
  }, [backend, recordActions, skipVisual]);

  const handleCreateInteraction = useCallback(
    async (step: { label: string; stepId: string }) => {
      setBusy(true);
      try {
        const log = await backend.createInteraction({
          storyId: DEMO_STORY_ID,
          stepLabel: step.label,
          stepId: step.stepId,
        });
        appendLog(log);
        setInteractionSteps((prev) =>
          prev.some((s) => s.id === step.stepId)
            ? prev
            : [...prev, { id: step.stepId, label: step.label }],
        );
        recordActions();
      } finally {
        setBusy(false);
      }
    },
    [appendLog, backend, recordActions],
  );

  const sections = useMemo(
    () => [
      {
        id: "default" as const,
        label: "Default",
        hint: "End of play · primary baseline",
        thumbSrc: images[0]?.src,
        status: (badgeStatus ?? "pass") as "pass" | "fail",
        stats: diffResult ? "0.0000% · mock" : "—",
      },
      ...interactionSteps.map((step) => ({
        id: step.id,
        label: step.label,
        hint: `No baseline yet · ${step.id}`,
        step: {
          callId: `call-${step.id}`,
          label: step.label,
          stepId: step.id,
        },
      })),
    ],
    [badgeStatus, diffResult, images, interactionSteps],
  );

  const progressRunning = isRunning || runProgress != null;
  const summaryState: PanelResultState = captureError
    ? "error"
    : progressRunning
      ? "running"
      : skipVisual
        ? "skipped"
        : images.length === 0
          ? initialState === "setup"
            ? "setup"
            : "missing"
          : badgeStatus === "pass"
            ? "passed"
            : badgeStatus === "fail"
              ? "failed"
              : initialState;
  const summaryCopy: Record<
    PanelResultState,
    { title: string; detail: string }
  > = {
    setup: {
      title: "Setup required",
      detail: "Create the Playwright suite and configuration first.",
    },
    skipped: {
      title: "Visual tests skipped",
      detail: "This story is excluded with skip-visual.",
    },
    missing: {
      title: "Baseline missing",
      detail: "Create a visual baseline to enable comparison.",
    },
    ready: {
      title: "Baseline ready",
      detail: "Run the visual test to refresh its comparison result.",
    },
    running: {
      title: "Visual test running",
      detail: runProgressLabel ?? "Comparing the current story.",
    },
    passed: {
      title: "Visual test passed",
      detail: "0.0000% different · 0 changed pixels.",
    },
    failed: {
      title: "Visual test failed",
      detail: "1.4200% different · pass threshold exceeded.",
    },
    error: {
      title: "Capture error",
      detail: captureError,
    },
  };
  const modeSummary = useMemo(() => {
    const statuses = Object.values(modeResults);
    if (statuses.length === 0) return null;
    const failed = statuses.filter((status) => status === "failed").length;
    const passed = statuses.filter((status) => status === "passed").length;
    const fresh = statuses.filter((status) => status === "new").length;
    const errors = statuses.filter((status) => status === "error").length;
    return [
      passed && `${passed} passed`,
      failed && `${failed} failed`,
      fresh && `${fresh} new`,
      errors && `${errors} error`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [modeResults]);

  return (
    <PanelView
      active
      standalone
      testId="panel-shell"
      header={{
        badgeStatus,
        empty: images.length === 0,
        busy: busy || isDiffing || progressRunning,
        storyMissing: false,
        isDiffing,
        isRunning: progressRunning,
        diffProgressLabel,
        runProgressLabel,
        createLabel: busy ? "Creating…" : "Create visual",
        reviewStatus,
        skipVisual,
        onDiff: handleDiff,
        onRun: (mode) => void handleRun(mode),
        diffEngine,
        onDiffEngineChange: setDiffEngine,
        onCreate: () => void handleCreate(),
        onUpdateBaselines: () => void handleUpdate(),
        onRebuildStatic: () => void handleRebuildStatic(),
        onResetSettings: () => {
          setDiffResult(null);
          setBadgeStatus(null);
          setStatusLog("");
        },
        onStopDiff: handleStopDiff,
        onStopRun: () => void handleStopRun(),
        onReviewStatus: (status) => void handleReview(status),
        onAccept: (scope) => {
          setAcceptScope(scope);
          void handleReview("approved");
        },
        onUnaccept: (scope) => {
          setAcceptScope(scope);
          void handleReview("pending");
        },
        acceptRunAvailable: runAvailable,
        onToggleSkipVisual: () => void handleToggleSkipVisual(),
        onOpenConfiguration: () => setShowConfiguration(true),
        isUpdating: busy && !isRebuilding,
        isRebuilding,
      }}
      configuration={
        showConfiguration ? (
          <ConfigurationPanel
            initialConfig={SAMPLE_CONFIG}
            onSaveProjectDefaults={async (projectDefaults) => {
              if (configurationSaveError) {
                throw new Error(configurationSaveError);
              }
              return {
                ...SAMPLE_CONFIG,
                playwrightPassThresholdPercent:
                  projectDefaults.passThresholdPercent,
                projectDefaults,
                projectDefaultSources: Object.fromEntries(
                  Object.keys(projectDefaults).map((key) => [key, "project"]),
                ) as VisualDeltaResolvedConfig["projectDefaultSources"],
                projectConfigExists: true,
              };
            }}
            onClose={() => setShowConfiguration(false)}
          />
        ) : null
      }
      summary={
        <PanelResultSummary
          state={summaryState}
          title={summaryCopy[summaryState].title}
          detail={summaryCopy[summaryState].detail}
          finishedAt={
            summaryState === "passed" || summaryState === "failed"
              ? Date.UTC(2026, 6, 26, 8, 30)
              : null
          }
          modeSummary={modeSummary}
        />
      }
      notice={
        baselineGeometryMismatch ? (
          <BaselineGeometryWarning mismatch={baselineGeometryMismatch} />
        ) : null
      }
      content={
        <>
          <div data-testid="panel-shell-meta" style={{ display: "none" }}>
            <span data-testid="fixture-actions">{actionLog}</span>
            <span data-testid="fixture-review">{reviewStatus ?? "none"}</span>
            <span data-testid="fixture-skip-visual">{String(skipVisual)}</span>
            <span data-testid="fixture-diff">{diffResult ?? "none"}</span>
            <span data-testid="fixture-placement">{placement}</span>
            <span data-testid="fixture-overlay-on">{String(overlayOn)}</span>
            <span data-testid="fixture-live-visible">
              {String(liveVisible)}
            </span>
            <span data-testid="fixture-gallery-index">{index}</span>
            <span data-testid="fixture-expanded-id">
              {expandedId ?? "none"}
            </span>
            <span data-testid="fixture-interaction">
              {interactionStepLabel}
            </span>
            <span data-testid="fixture-accept-scope">{acceptScope}</span>
            <span data-testid="fixture-log">{statusLog}</span>
            <span data-testid="fixture-mode">{selectedMode ?? "Default"}</span>
          </div>

          <PanelToolbar>
            <ToolbarRow>
              <ModeSelector
                modeNames={modeNames}
                value={selectedMode}
                onChange={setSelectedMode}
                results={modeResults}
                disabled={busy}
              />
              <LiveVisibilityToggle
                liveVisible={liveVisible}
                onToggle={setLiveVisible}
              />
              {liveVisible ? (
                <PlacementPad
                  value={placement}
                  active={overlayOn}
                  onToggle={(next) => {
                    const action = placementToggleAction(
                      {
                        overlayOn,
                        placement,
                        index,
                        imageCount: images.length,
                        opacity: 1,
                      },
                      next,
                    );
                    if (action.type === "soft-hide") {
                      setOverlayOn(false);
                      return;
                    }
                    setOverlayOn(true);
                    setPlacement(action.placement);
                    setIndex(action.index);
                  }}
                />
              ) : null}
              <ImageGallery
                images={images}
                selectedIndex={index}
                onSelect={setIndex}
              />
            </ToolbarRow>
            {diffResult ? <ErrorText>{diffResult}</ErrorText> : null}
          </PanelToolbar>

          <BaselineAccordion
            sections={sections}
            expandedId={expandedId}
            busy={busy}
            showDistribution={showDistribution}
            onExpand={(id) =>
              setExpandedId((prev) => (prev === id ? null : id))
            }
            onCreate={(step) => void handleCreateInteraction(step)}
            onUpdate={(step) => void handleCreateInteraction(step)}
            onUpdateDefault={() => void handleUpdate()}
            onToggleDistribution={() => setShowDistribution((v) => !v)}
            renderBody={(section) => (
              <FormPlaceholder
                data-testid={`fixture-section-body-${section.id}`}
              >
                Body for {section.label}
                {showDistribution && section.id === "default"
                  ? " · distribution on"
                  : ""}
              </FormPlaceholder>
            )}
          />
        </>
      }
      status={{
        running: busy || isDiffing || progressRunning,
        label:
          runProgressLabel ??
          (runProgress
            ? `Testing… ${runProgress.completed}/${runProgress.total}`
            : diffProgressLabel),
        log: statusLog,
        error: captureError || null,
        progress: runProgress,
      }}
    />
  );
}
