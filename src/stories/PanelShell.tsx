import React, { useCallback, useMemo, useState } from "react";
import type {
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
import { ImageGallery } from "../panel/ImageGallery.js";
import { LiveVisibilityToggle } from "../panel/LiveVisibilityToggle.js";
import { PlacementPad } from "../panel/PlacementPad.js";
import { VisualDeltaHeader } from "../panel/VisualDeltaHeader.js";
import {
  ErrorText,
  PanelBody,
  PanelShell as Shell,
  Toolbar as PanelToolbar,
  ToolbarRow,
} from "../panel/styled.js";
import { placementToggleAction } from "../shared/overlay-session.js";
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

export type PanelShellProps = {
  /** Injected backend (tests/stories share one instance for assertions). */
  backend?: MockVisualBackend;
  /** Start with no baselines so the Create visual CTA is shown. */
  seedEmpty?: boolean;
};

/**
 * Catalog harness that looks like the live Visual Delta panel and drives
 * create/update/run/review through an in-memory mock backend.
 */
export function PanelShell({
  backend: backendProp,
  seedEmpty = false,
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
  const [skipVisual, setSkipVisual] = useState(false);
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
  const [statusLog, setStatusLog] = useState("");
  const [expandedId, setExpandedId] = useState<"default" | string | null>(
    "default",
  );
  const [showDistribution, setShowDistribution] = useState(false);
  const [interactionSteps, setInteractionSteps] = useState<
    Array<{ id: string; label: string }>
  >([{ id: "opens-chooser", label: "Opens chooser" }]);

  const [actionLog, setActionLog] = useState<string>("");
  const [interactionStepLabel, setInteractionStepLabel] = useState("none");

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
      setDiffProgressLabel(
        engine === "chromium" ? "Capturing…" : "Diffing…",
      );
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
            if (event.type === "progress" && event.completed != null) {
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
        setRunProgressLabel(null);
      }
    },
    [appendLog, backend, recordActions],
  );

  const handleStopRun = useCallback(async () => {
    await backend.cancelTests();
    setIsRunning(false);
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

  return (
    <Shell data-testid="panel-shell" style={{ minHeight: 420 }}>
      <VisualDeltaHeader
        badgeStatus={badgeStatus}
        empty={images.length === 0}
        busy={busy || isDiffing || isRunning}
        storyMissing={false}
        isDiffing={isDiffing}
        isRunning={isRunning}
        diffProgressLabel={diffProgressLabel}
        runProgressLabel={runProgressLabel}
        createLabel={busy ? "Creating…" : "Create visual"}
        reviewStatus={reviewStatus}
        skipVisual={skipVisual}
        onDiff={handleDiff}
        onRun={(mode) => void handleRun(mode)}
        diffEngine={diffEngine}
        onDiffEngineChange={setDiffEngine}
        onCreate={() => void handleCreate()}
        onUpdateBaselines={() => void handleUpdate()}
        onRebuildStatic={() => void handleRebuildStatic()}
        onResetSettings={() => {
          setDiffResult(null);
          setBadgeStatus(null);
          setStatusLog("");
        }}
        onStopDiff={handleStopDiff}
        onStopRun={() => void handleStopRun()}
        onReviewStatus={(status) => void handleReview(status)}
        onAccept={(scope) =>
          void handleReview(scope === "component" ? "approved" : "approved")
        }
        onUnaccept={() => void handleReview("pending")}
        onToggleSkipVisual={() => void handleToggleSkipVisual()}
        onOpenConfiguration={() => {
          setStatusLog("Configuration (mock)");
        }}
        isUpdating={busy && !isRebuilding}
        isRebuilding={isRebuilding}
      />
      <PanelBody>
        <div data-testid="panel-shell-meta" style={{ display: "none" }}>
          <span data-testid="fixture-actions">{actionLog}</span>
          <span data-testid="fixture-review">{reviewStatus ?? "none"}</span>
          <span data-testid="fixture-skip-visual">{String(skipVisual)}</span>
          <span data-testid="fixture-diff">{diffResult ?? "none"}</span>
          <span data-testid="fixture-placement">{placement}</span>
          <span data-testid="fixture-overlay-on">{String(overlayOn)}</span>
          <span data-testid="fixture-live-visible">{String(liveVisible)}</span>
          <span data-testid="fixture-gallery-index">{index}</span>
          <span data-testid="fixture-expanded-id">{expandedId ?? "none"}</span>
          <span data-testid="fixture-interaction">{interactionStepLabel}</span>
          <span data-testid="fixture-log">{statusLog}</span>
        </div>

        <PanelToolbar>
          <ToolbarRow>
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
      </PanelBody>
    </Shell>
  );
}
