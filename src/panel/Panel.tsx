import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import pixelmatch from "pixelmatch";
import {
  AddonPanel,
  Button,
  EmptyTabContent,
  ToggleButton,
} from "storybook/internal/components";
import {
  experimental_getTestProviderStore,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  TEST_PROVIDER_ID,
  isSplitPlacement,
  visualReviewStatusFromTags,
  type VisualReviewStatus,
} from "../constants.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  componentStoryIdsFor,
  formatVisualProgressLabel,
  postVisualCreateBaseline,
  postVisualInteractionBaseline,
  postVisualReviewStatus,
  postVisualRun,
  postVisualUpdateBaseline,
  publishVisualLastRun,
  subscribeVisualCreateProgress,
  subscribeVisualRunProgress,
  visualResultFromLiveDiff,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualRunProgress,
} from "../manager/run-visual.js";
import type { VisualRunMode } from "../manager/VisualRunSplitButton.js";
import type { DiffResultData } from "../types.js";
import {
  capturePreviewSubject,
  fitImageData,
  loadImage,
  maskTransparentRegions,
  withPlaywrightPreviewViewport,
} from "./capture.js";
import { buildDiffHistogram, buildFocusAssets } from "./diff-assets.js";
import { DiffResult } from "./DiffResult.js";
import { useOverlayHidden, useOverlayInfo, useStoryData } from "./hooks.js";
import { loadPlaywrightDiffResult } from "./load-playwright-diff.js";
import { ImageGallery } from "./ImageGallery.js";
import {
  BaselineAccordion,
  SectionThumb,
  SectionThumbFrame,
  type BaselineSection,
  type BaselineSectionId,
} from "./BaselineAccordion.js";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { PanelStatusBar } from "./PanelStatusBar.js";
import { PlacementPad } from "./PlacementPad.js";
import { VisualDeltaHeader } from "./VisualDeltaHeader.js";
import { baselineUrlForStoryRef } from "../shared/baseline-url.js";
import {
  endPlayDebug,
  gotoPlayStep,
  mergeInteractionRows,
  remountStory,
  usePlaySteps,
  type PlayStepInfo,
} from "./usePlaySteps.js";
import {
  ButtonGroup,
  Checkbox,
  CheckboxContainer,
  ErrorText,
  InlineControl,
  PanelBody,
  PanelScroll,
  PanelShell,
  SkeletonBone,
  SkeletonRoot,
  Slider,
  Toolbar as PanelToolbar,
  ToolbarRow,
  ToolbarSpacer,
  ValueDisplay,
} from "./styled.js";

const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

export const Panel = memo(function Panel(props: { active?: boolean }) {
  const api = useStorybookApi();
  const { storyId: currentStoryId } = useStorybookState();
  const [shellEl, setShellEl] = useState<HTMLDivElement | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const {
    images,
    interactions,
    index,
    overlayOn,
    storyId,
    opacity,
    colorInversion,
    placement,
    liveVisible,
    passThresholdPercent,
    setIndex,
    setOpacity,
    setColorInversion,
    togglePlacement,
    setLiveVisible,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    revealCenteredOverlay,
    hydrateBaselineImages,
    hydrateInteractions,
    selectInteractionBaseline,
    restorePrimaryBaselines,
    primaryImages,
  } = useStoryData();
  /** Preview decorator hasn't sent INIT_IMAGE for this story yet. */
  const storyReady = Boolean(storyId) && storyId === currentStoryId;
  const loading = !storyReady;
  const { steps: playSteps } = usePlaySteps(storyId || undefined);
  const interactionSteps = useMemo(
    () => mergeInteractionRows(playSteps, interactions),
    [playSteps, interactions],
  );
  const [expandedId, setExpandedId] = useState<BaselineSectionId | null>(
    "default",
  );
  const [selectedInteractionId, setSelectedInteractionId] = useState<
    string | null
  >(null);
  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [optimisticReview, setOptimisticReview] =
    useState<VisualReviewStatus | null>(null);
  const [isRunningVisual, setIsRunningVisual] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  /** Bumped after a Playwright visual run so we reload sidecar artifacts. */
  const [diffEpoch, setDiffEpoch] = useState(0);
  const [runProgress, setRunProgress] = useState<VisualRunProgress | null>(
    null,
  );
  const [baselineJob, setBaselineJob] = useState<VisualCreateProgress | null>(
    null,
  );
  const isCreating = Boolean(
    baselineJob?.running && baselineJob.kind === "create",
  );
  const isUpdating = Boolean(
    baselineJob?.running && baselineJob.kind === "update",
  );
  const isInteractionJob = Boolean(
    baselineJob?.running && baselineJob.kind === "interaction",
  );
  const createProgress = baselineJob?.kind === "create" ? baselineJob : null;
  const isSplit = isSplitPlacement(placement);
  const busy =
    isDiffing ||
    isUpdating ||
    isCreating ||
    isInteractionJob ||
    isRunningVisual ||
    isReviewing;
  const storyEntry = storyId ? api.getData(storyId) : undefined;
  const storyTagsKey = (storyEntry?.tags ?? []).join("\0");
  const reviewFromStory = visualReviewStatusFromTags(storyEntry?.tags);
  const reviewStatus = optimisticReview ?? reviewFromStory;

  useEffect(() => {
    setOptimisticReview(null);
    setSelectedInteractionId(null);
    setExpandedId("default");
    setShowDistribution(false);
  }, [storyId, storyTagsKey]);

  const activeSectionId: BaselineSectionId = selectedInteractionId ?? "default";
  const activeDiffMeta = useMemo(() => {
    if (!diffResult) return null;
    const threshold = diffResult.passThresholdPercent ?? 0.1;
    return {
      status: (diffResult.passed ? "pass" : "fail") as const,
      stats: `${diffResult.diffPercent.toFixed(4)}% · ${diffResult.diffPixels}/${diffResult.totalPixels} px · <${threshold}%`,
    };
  }, [diffResult]);

  const baselineSections = useMemo((): BaselineSection[] => {
    const sections: BaselineSection[] = [];
    if (primaryImages.length > 0) {
      const isActive = activeSectionId === "default";
      sections.push({
        id: "default",
        label: "Default",
        hint: "End of play · primary baseline",
        thumbSrc: primaryImages[0]?.src,
        status: isActive ? activeDiffMeta?.status : null,
        stats: isActive ? activeDiffMeta?.stats : null,
      });
    }
    for (const step of interactionSteps) {
      const wired = interactions.find((item) => item.id === step.stepId);
      const isActive = activeSectionId === step.stepId;
      sections.push({
        id: step.stepId,
        label: step.label,
        hint: wired
          ? `Baseline wired · ${step.stepId}`
          : `No baseline yet · ${step.stepId}`,
        thumbSrc: wired?.src,
        step,
        wired,
        status: isActive ? activeDiffMeta?.status : null,
        stats: isActive ? activeDiffMeta?.stats : null,
      });
    }
    return sections;
  }, [
    activeDiffMeta,
    activeSectionId,
    interactionSteps,
    interactions,
    primaryImages,
  ]);

  const selectSection = useCallback(
    (id: BaselineSectionId) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (id === "default") {
        setSelectedInteractionId(null);
        restorePrimaryBaselines();
        if (storyId) endPlayDebug(storyId);
        return;
      }
      if (!storyId) return;
      const step = interactionSteps.find((item) => item.stepId === id);
      if (!step) return;
      setSelectedInteractionId(step.stepId);
      if (step.callId) {
        gotoPlayStep(storyId, step.callId);
      } else {
        remountStory(storyId);
      }
      const wired = interactions.find((item) => item.id === step.stepId);
      if (wired) {
        selectInteractionBaseline(wired.src);
      }
    },
    [
      expandedId,
      interactionSteps,
      interactions,
      restorePrimaryBaselines,
      selectInteractionBaseline,
      storyId,
    ],
  );

  const handleCreateInteraction = useCallback(
    async (step: PlayStepInfo, overwrite: boolean) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setCaptureError(null);
      setUpdateLog(null);
      try {
        await postVisualInteractionBaseline({
          storyId,
          stepLabel: step.label,
          stepId: step.stepId,
          overwrite,
        });
        const bust = `t=${Date.now()}`;
        // Prefer URL from on-disk convention; CSF HMR may lag.
        const entry = api.getData(storyId);
        const primary = baselineUrlForStoryRef(
          {
            id: storyId,
            title: entry && "title" in entry ? String(entry.title) : undefined,
            importPath:
              entry && "importPath" in entry
                ? String(entry.importPath)
                : undefined,
            tags: entry?.tags,
          },
          { allowSkipVisual: true },
        );
        const src = primary
          ? primary.replace(
              /-chromium-darwin\.png$/i,
              `--${step.stepId}-chromium-darwin.png`,
            )
          : undefined;
        if (src) {
          const nextInteractions = [
            ...interactions.filter((item) => item.id !== step.stepId),
            { id: step.stepId, label: step.label, src },
          ];
          hydrateInteractions(nextInteractions);
          selectInteractionBaseline(`${src}?${bust}`);
          setSelectedInteractionId(step.stepId);
          setExpandedId(step.stepId);
          setDiffEpoch((n) => n + 1);
        }
        revealCenteredOverlay();
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "Interaction baseline failed",
        );
      }
    },
    [
      api,
      hydrateInteractions,
      interactions,
      revealCenteredOverlay,
      selectInteractionBaseline,
      storyId,
    ],
  );

  const baselineSrc = images[index]?.src;
  const progressLabel =
    isRunningVisual && !isDiffing
      ? formatVisualProgressLabel(runProgress)
      : null;
  const statusRunning =
    loading ||
    isCreating ||
    isUpdating ||
    isInteractionJob ||
    isRunningVisual;
  const statusLabel = loading
    ? "Loading…"
    : statusRunning
      ? isRunningVisual
        ? progressLabel
        : (baselineJob?.label ?? null)
      : null;

  useEffect(() => {
    setCaptureError(null);
    if (!baselineSrc) {
      setDiffResult(null);
      return;
    }
    let cancelled = false;
    setDiffResult(null);
    void loadPlaywrightDiffResult(baselineSrc, diffEpoch || Date.now()).then(
      (result) => {
        if (!cancelled) setDiffResult(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [storyId, index, baselineSrc, diffEpoch]);

  // Live progress + reload compare view when a visual run finishes.
  useEffect(() => {
    let sawProgress = false;
    return subscribeVisualRunProgress((next) => {
      setRunProgress(next);
      if (next) {
        sawProgress = true;
        return;
      }
      if (sawProgress) {
        sawProgress = false;
        setDiffEpoch(Date.now());
      }
    });
  }, []);

  // Create/update baseline progress — stream logs; on success show center overlay.
  useEffect(() => {
    let wasRunning = false;
    return subscribeVisualCreateProgress((next) => {
      setBaselineJob(next);
      if (next?.running) {
        wasRunning = true;
        setCaptureError(null);
        setUpdateLog(next.logTail ?? null);
        return;
      }
      if (!wasRunning || !next) return;
      wasRunning = false;
      if (next.logTail) setUpdateLog(next.logTail);
      if (next.error) {
        setCaptureError(next.error);
        return;
      }
      // CSF may already be wired (no HMR) or index tags still say skip-visual —
      // hydrate from the known PNG path so the empty-state panel fills.
      const entry = currentStoryId ? api.getData(currentStoryId) : undefined;
      const url = baselineUrlForStoryRef(
        {
          id: currentStoryId,
          importPath: entry?.importPath,
          tags: entry?.tags,
        },
        { allowSkipVisual: next.kind === "create" },
      );
      if (url) {
        // Prefer hydrate over remount: remount can re-emit INIT_IMAGE with
        // stale empty parameters before CSF HMR lands and wipe the gallery.
        hydrateBaselineImages([url]);
      } else {
        revealCenteredOverlay();
      }
      setDiffResult(null);
      setDiffEpoch(Date.now());
    });
  }, [api, currentStoryId, hydrateBaselineImages, revealCenteredOverlay]);

  const handleDiff = useCallback(async () => {
    if (index === -1 || !images[index]) {
      setCaptureError("Please select a baseline image first");
      return;
    }
    setIsDiffing(true);
    setCaptureError(null);
    setDiffResult(null);
    try {
      const currentOverlayInfo = await getOverlayInfo();
      if (!currentOverlayInfo?.image?.src) {
        throw new Error(
          "Unable to get baseline image; make sure an image is selected",
        );
      }
      const baseline = await loadImage(currentOverlayInfo.image.src);
      const overlayHidden = waitForOverlayHidden();
      hideOverlay();
      await overlayHidden;
      let capture: Awaited<ReturnType<typeof capturePreviewSubject>>;
      try {
        capture = await withPlaywrightPreviewViewport(() =>
          capturePreviewSubject(),
        );
      } finally {
        showOverlay();
      }
      const actual = await loadImage(capture.dataUrl);
      const width = baseline.width;
      const height = baseline.height;
      const baselineData = baseline.imageData.data;
      const actualData = fitImageData(actual.imageData, width, height);
      const sizeNote =
        actual.width === width && actual.height === height
          ? `${width}×${height}`
          : `baseline ${width}×${height}, actual ${actual.width}×${actual.height} (padded/cropped)`;
      const { baselineForDiff, actualForDiff, ignore } = maskTransparentRegions(
        baselineData,
        actualData,
        width,
        height,
      );
      const actualMaskedCanvas = document.createElement("canvas");
      actualMaskedCanvas.width = width;
      actualMaskedCanvas.height = height;
      const actualMaskedCtx = actualMaskedCanvas.getContext("2d");
      if (!actualMaskedCtx) throw new Error("Unable to get canvas context");
      const actualMaskedImageData = actualMaskedCtx.createImageData(
        width,
        height,
      );
      actualMaskedImageData.data.set(actualData);
      for (let p = 0; p < width * height; p++) {
        if (!ignore[p]) continue;
        const i = p * 4;
        actualMaskedImageData.data[i] = 0;
        actualMaskedImageData.data[i + 1] = 0;
        actualMaskedImageData.data[i + 2] = 0;
        actualMaskedImageData.data[i + 3] = 0;
      }
      actualMaskedCtx.putImageData(actualMaskedImageData, 0, 0);
      const actualMaskedDataUrl = actualMaskedCanvas.toDataURL("image/png");
      const diffData = new Uint8ClampedArray(width * height * 4);
      const diffPixels = pixelmatch(
        actualForDiff,
        baselineForDiff,
        diffData,
        width,
        height,
        {
          threshold: 0.2,
          includeAA: false,
          alpha: 0.1,
          diffColor: [255, 0, 0],
          diffColorAlt: [0, 255, 0],
        },
      );
      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = width;
      diffCanvas.height = height;
      const ctx = diffCanvas.getContext("2d");
      if (!ctx) throw new Error("Unable to get canvas context");
      const diffImageData = ctx.createImageData(width, height);
      diffImageData.data.set(diffData);
      ctx.putImageData(diffImageData, 0, 0);
      const { focusDataUrl, changeBounds } = buildFocusAssets(
        actualMaskedImageData.data,
        diffData,
        width,
        height,
      );
      const diffHistogram = buildDiffHistogram(
        baselineForDiff,
        actualForDiff,
        diffData,
        width,
        height,
      );
      const totalPixels = width * height;
      const diffPercent = (diffPixels / totalPixels) * 100;
      const threshold = passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
      const passed = diffPercent < threshold;
      setDiffResult({
        actualImage: actualMaskedDataUrl,
        diffImage: diffCanvas.toDataURL("image/png"),
        baselineImage: baseline.dataUrl,
        focusImage: focusDataUrl,
        changeBounds,
        imageWidth: width,
        imageHeight: height,
        diffPixels,
        totalPixels,
        diffPercent,
        passThresholdPercent: threshold,
        passed,
        sizeNote,
        diffHistogram,
      });
      if (storyId) {
        applyVisualStatuses([
          visualResultFromLiveDiff({
            storyId,
            diffPercent,
            diffPixels,
            totalPixels,
            passThresholdPercent: threshold,
            passed,
          }),
        ]);
      }
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Diff failed");
    } finally {
      setIsDiffing(false);
    }
  }, [
    index,
    images,
    storyId,
    passThresholdPercent,
    getOverlayInfo,
    waitForOverlayHidden,
    hideOverlay,
    showOverlay,
  ]);

  const handleUpdateBaselines = useCallback(async () => {
    if (!storyId) {
      setCaptureError("No story selected");
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualUpdateBaseline({ storyId });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [storyId]);

  const handleCreateBaselines = useCallback(async () => {
    if (!storyId) {
      setCaptureError("No story selected");
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualCreateBaseline({ storyId });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [storyId]);

  const handleSetReviewStatus = useCallback(
    async (status: VisualReviewStatus) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsReviewing(true);
      setCaptureError(null);
      try {
        await postVisualReviewStatus({ storyId, status });
        setOptimisticReview(status);
        const messages: Record<VisualReviewStatus, string> = {
          pending: "Marked baseline as pending review (visual-pending).",
          approved: "Marked baseline as approved (visual-approved).",
          failed: "Marked baseline as failed (visual-failed).",
        };
        setUpdateLog(messages[status]);
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "Failed to update review status",
        );
      } finally {
        setIsReviewing(false);
      }
    },
    [storyId],
  );

  const handleRunVisual = useCallback(
    async (scope: "story" | "component" | "all") => {
      if (scope !== "all" && !storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsRunningVisual(true);
      setCaptureError(null);
      try {
        const storyIds =
          scope === "all"
            ? undefined
            : visualRunnableStoryIds(
                api,
                scope === "story"
                  ? [storyId!]
                  : componentStoryIdsFor(api, storyId!),
              );
        if (scope !== "all" && !storyIds?.length) {
          throw new Error(
            "No runnable visual stories in this scope (all skip-visual)",
          );
        }
        await testProviderStore.runWithState(async () => {
          if (storyIds?.length) {
            applyPendingVisualStatuses(storyIds);
          } else {
            clearVisualStatuses();
          }
          const data = await postVisualRun({ storyIds, rebuild: false });
          if (data.crashed) {
            publishVisualLastRun({
              finishedAt: Date.now(),
              summary: data.summary,
              error: data.error ?? "Visual test run crashed",
              scope,
            });
            throw new Error(data.error ?? "Visual test run crashed");
          }
          applyVisualRunResults(storyIds, data.results);
          publishVisualLastRun({
            finishedAt: Date.now(),
            summary: data.summary,
            error:
              data.summary.failed > 0
                ? `${data.summary.failed} failed`
                : undefined,
            scope,
          });
          setDiffEpoch(Date.now());
          if (data.summary.failed > 0) {
            setCaptureError(
              `Visual: ${data.summary.failed} failed · ${data.summary.passed} passed`,
            );
          }
          const summaryLine =
            data.summary.failed > 0
              ? `Visual: ${data.summary.failed} failed · ${data.summary.passed} passed (${scope})`
              : `Visual: ${data.summary.passed} passed (${scope})`;
          const logTail = data.logTail?.trim();
          setUpdateLog(logTail ? `${logTail}\n${summaryLine}` : summaryLine);
        });
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : "Visual test run failed",
        );
      } finally {
        setIsRunningVisual(false);
      }
    },
    [api, storyId],
  );

  const handleSplitAction = useCallback(
    (mode: VisualRunMode) => {
      if (mode === "diff") {
        void handleDiff();
        return;
      }
      void handleRunVisual(mode);
    },
    [handleDiff, handleRunVisual],
  );

  const isEmpty = primaryImages.length === 0 && images.length === 0;
  const badgeStatus = diffResult
    ? diffResult.passed
      ? ("pass" as const)
      : ("fail" as const)
    : null;

  const renderSectionBody = useCallback(
    (section: BaselineSection) => (
      <>
        <PanelToolbar>
          <ToolbarRow>
            {section.thumbSrc ? (
              <SectionThumbFrame title={section.label}>
                <SectionThumb src={section.thumbSrc} alt="" />
              </SectionThumbFrame>
            ) : null}
            {section.id === "default" &&
            liveVisible &&
            primaryImages.length > 1 ? (
              <ImageGallery
                images={primaryImages}
                selectedIndex={
                  selectedInteractionId ? 0 : Math.max(0, index)
                }
                onSelect={setIndex}
              />
            ) : null}
            <LiveVisibilityToggle
              liveVisible={liveVisible}
              onToggle={setLiveVisible}
              disabled={images.length === 0}
            />
            {liveVisible ? (
              <PlacementPad
                value={placement}
                active={overlayOn}
                onToggle={togglePlacement}
                disabled={images.length === 0}
              />
            ) : null}
            {index >= 0 && (!isSplit || !liveVisible) ? (
              <ButtonGroup role="group" aria-label="Overlay controls">
                <ToggleButton
                  size="small"
                  pressed={false}
                  onClick={resetOverlay}
                  aria-label="Reset overlay position after drag"
                  title="Reset overlay position after drag"
                >
                  Reset
                </ToggleButton>
              </ButtonGroup>
            ) : null}
            <ToolbarSpacer />
            {liveVisible && index >= 0 && !isSplit ? (
              <>
                <InlineControl title="Overlay opacity">
                  <span>Opacity</span>
                  <Slider
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  />
                  <ValueDisplay>{Math.round(opacity * 100)}%</ValueDisplay>
                </InlineControl>
                <CheckboxContainer>
                  <Checkbox
                    type="checkbox"
                    checked={colorInversion}
                    onChange={(e) => setColorInversion(e.target.checked)}
                  />
                  <span>Blend</span>
                </CheckboxContainer>
              </>
            ) : null}
            <InlineControl title="Pass if diff % is below this">
              <span>Thresh</span>
              <Slider
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={passThresholdPercent}
                onChange={(e) =>
                  setPassThresholdPercent(parseFloat(e.target.value))
                }
              />
              <ValueDisplay>{passThresholdPercent}%</ValueDisplay>
            </InlineControl>
          </ToolbarRow>
          {captureError ? <ErrorText>{captureError}</ErrorText> : null}
        </PanelToolbar>
        {diffResult && images.length > 0 ? (
          <DiffResult
            result={diffResult}
            showHistogram={showDistribution}
          />
        ) : null}
      </>
    ),
    [
      captureError,
      colorInversion,
      diffResult,
      images.length,
      index,
      isSplit,
      liveVisible,
      opacity,
      overlayOn,
      passThresholdPercent,
      placement,
      primaryImages,
      resetOverlay,
      selectedInteractionId,
      setColorInversion,
      setIndex,
      setLiveVisible,
      setOpacity,
      setPassThresholdPercent,
      showDistribution,
      togglePlacement,
    ],
  );

  return (
    <AddonPanel active={props.active ?? false}>
      <PanelShell ref={setShellEl}>
        <PanelScroll>
          <VisualDeltaHeader
            badgeStatus={loading ? null : badgeStatus}
            empty={loading ? false : isEmpty}
            busy={busy || loading}
            storyMissing={!storyId || loading}
            isRunning={!loading && (isRunningVisual || isDiffing)}
            progressLabel={loading ? null : progressLabel}
            createLabel={
              isCreating
                ? (createProgress?.label ?? "Creating…")
                : "Create visual"
            }
            reviewStatus={loading ? null : reviewStatus}
            onRunDiff={handleSplitAction}
            onCreate={() => void handleCreateBaselines()}
            onUpdateBaselines={() => void handleUpdateBaselines()}
            onResetSettings={resetSettings}
            onStop={() => void cancelVisualRun()}
            onReviewStatus={(status) => void handleSetReviewStatus(status)}
            isUpdating={isUpdating}
          />
          <PanelBody>
            {loading ? (
              <SkeletonRoot
                role="status"
                aria-busy="true"
                aria-label="Loading Visual Delta"
              >
                <SkeletonBone width="100%" height={180} radius={8} />
                <SkeletonBone width="40%" height={12} radius={4} />
              </SkeletonRoot>
            ) : isEmpty && baselineSections.length === 0 ? (
              <EmptyTabContent
                title="Visual Delta"
                description="Capture a Playwright baseline for this story, then compare live canvas to the PNG with overlay and diff tools."
                footer={
                  <Button
                    size="small"
                    ariaLabel="Create visual baseline"
                    disabled={!storyId || busy}
                    onClick={() => void handleCreateBaselines()}
                  >
                    {isCreating
                      ? (createProgress?.label ?? "Creating…")
                      : "Create visual"}
                  </Button>
                }
              />
            ) : (
              <BaselineAccordion
                sections={baselineSections}
                expandedId={expandedId}
                busy={busy}
                showDistribution={showDistribution}
                onExpand={selectSection}
                onCreate={(step) =>
                  void handleCreateInteraction(step, false)
                }
                onUpdate={(step) =>
                  void handleCreateInteraction(step, true)
                }
                onToggleDistribution={() =>
                  setShowDistribution((value) => !value)
                }
                renderBody={renderSectionBody}
              />
            )}
          </PanelBody>
        </PanelScroll>
        <PanelStatusBar
          container={shellEl}
          running={statusRunning}
          label={statusLabel}
          log={updateLog}
          error={captureError}
        />
      </PanelShell>
    </AddonPanel>
  );
});
