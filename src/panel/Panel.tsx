import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  EllipsisIcon,
  SyncIcon,
  UndoIcon,
} from "@storybook/icons";
import pixelmatch from "pixelmatch";
import {
  ActionList,
  AddonPanel,
  Button,
  IconButton,
  PopoverProvider,
  ToggleButton,
} from "storybook/internal/components";
import {
  experimental_getTestProviderStore,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { useTheme } from "storybook/theming";
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
import {
  VisualRunSplitButton,
  type VisualRunMode,
} from "../manager/VisualRunSplitButton.js";
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
import {
  useOverlayHidden,
  useOverlayInfo,
  useStoryData,
} from "./hooks.js";
import { loadPlaywrightDiffResult } from "./load-playwright-diff.js";
import { ImageGallery } from "./ImageGallery.js";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { PlacementPad } from "./PlacementPad.js";
import { ReviewStatusPad } from "./ReviewStatusPad.js";
import { baselineUrlForStoryRef } from "../shared/baseline-url.js";
import {
  Actions,
  ButtonGroup,
  Checkbox,
  CheckboxContainer,
  EmptyCreateWrap,
  EmptyState,
  EmptyStateContainer,
  ErrorText,
  InlineControl,
  SkeletonBone,
  SkeletonRoot,
  SkeletonToolbar,
  Slider,
  Toolbar,
  ToolbarRow,
  ToolbarSpacer,
  ValueDisplay,
} from "./styled.js";

const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

export const Panel = memo(function Panel(props: { active?: boolean }) {
  const theme = useTheme();
  const api = useStorybookApi();
  const { storyId: currentStoryId } = useStorybookState();
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const {
    images,
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
  } = useStoryData();
  /** Preview decorator hasn't sent INIT_IMAGE for this story yet. */
  const storyReady = Boolean(storyId) && storyId === currentStoryId;
  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [optimisticReview, setOptimisticReview] =
    useState<VisualReviewStatus | null>(null);
  const [isRunningVisual, setIsRunningVisual] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const updateLogRef = useRef<HTMLPreElement | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
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
  const createProgress =
    baselineJob?.kind === "create" ? baselineJob : null;
  const isSplit = isSplitPlacement(placement);
  const busy =
    isDiffing || isUpdating || isCreating || isRunningVisual || isReviewing;
  const storyEntry = storyId ? api.getData(storyId) : undefined;
  const storyTagsKey = (storyEntry?.tags ?? []).join("\0");
  const reviewFromStory = visualReviewStatusFromTags(storyEntry?.tags);
  const reviewStatus = optimisticReview ?? reviewFromStory;

  useEffect(() => {
    setOptimisticReview(null);
  }, [storyId, storyTagsKey]);

  // Keep the create/update log pinned to the latest lines while streaming.
  useEffect(() => {
    const el = updateLogRef.current;
    if (!el || !updateLog) return;
    el.scrollTop = el.scrollHeight;
  }, [updateLog]);

  const baselineSrc = images[index]?.src;
  const progressLabel =
    isRunningVisual && !isDiffing
      ? formatVisualProgressLabel(runProgress)
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
      const entry = currentStoryId
        ? api.getData(currentStoryId)
        : undefined;
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
  }, [
    api,
    currentStoryId,
    hydrateBaselineImages,
    revealCenteredOverlay,
  ]);

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
      const threshold =
        passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
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
          } else {
            setUpdateLog(`Visual: ${data.summary.passed} passed (${scope})`);
          }
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

  return (
    <AddonPanel active={props.active ?? false}>
      {!storyReady ? (
        <SkeletonRoot
          role="status"
          aria-busy="true"
          aria-label="Loading Visual Delta"
        >
          <SkeletonToolbar>
            <SkeletonBone width={56} height={40} radius={6} />
            <SkeletonBone width={56} height={40} radius={6} />
            <SkeletonBone width={56} height={40} radius={6} />
            <SkeletonBone width={88} height={28} radius={6} />
            <div style={{ flex: 1, minWidth: 12 }} />
            <SkeletonBone width={72} height={12} radius={4} />
            <SkeletonBone width={96} height={28} radius={6} />
            <SkeletonBone width={28} height={28} radius={6} />
          </SkeletonToolbar>
          <SkeletonBone width="100%" height={180} radius={8} />
          <SkeletonBone width="40%" height={12} radius={4} />
        </SkeletonRoot>
      ) : images.length === 0 ? (
        <EmptyStateContainer>
          <EmptyCreateWrap>
            <EmptyState style={{ color: theme.color.mediumdark }}>
              Configure images in the story parameters.visualDelta.images
            </EmptyState>
            <Button
              size="medium"
              disabled={!storyId || busy}
              ariaLabel="Create baseline"
              onClick={() => void handleCreateBaselines()}
            >
              {isCreating
                ? (createProgress?.label ?? "Creating…")
                : "Create Baseline"}
            </Button>
            {isCreating ? (
              <EmptyState
                style={{
                  color: theme.textMutedColor,
                  fontSize: theme.typography.size.s1,
                }}
              >
                {createProgress?.label ?? "Creating…"}
              </EmptyState>
            ) : null}
            {captureError ? <ErrorText>{captureError}</ErrorText> : null}
            {updateLog ? (
              <pre
                ref={updateLogRef}
                className="font-mono"
                style={{
                  margin: 0,
                  width: "100%",
                  maxWidth: 560,
                  color: captureError
                    ? theme.color.negative
                    : theme.color.positive,
                  whiteSpace: "pre-wrap",
                  maxHeight: 220,
                  overflow: "auto",
                  fontSize: 11,
                  textAlign: "left",
                  fontFamily: theme.typography.fonts.mono,
                }}
              >
                {updateLog.slice(-4000)}
              </pre>
            ) : null}
          </EmptyCreateWrap>
        </EmptyStateContainer>
      ) : (
        <>
          <Toolbar>
            <ToolbarRow>
              {liveVisible ? (
                <ImageGallery
                  images={images}
                  selectedIndex={index}
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
              <ReviewStatusPad
                value={reviewStatus}
                disabled={busy || !storyId}
                onSelect={(status) => void handleSetReviewStatus(status)}
              />
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
              <Actions>
                <VisualRunSplitButton
                  panel
                  compact
                  isRunning={isRunningVisual || isDiffing}
                  progressLabel={progressLabel}
                  disabled={busy && !isRunningVisual && !isDiffing}
                  storyMissing={!storyId}
                  diffDisabled={index === -1}
                  allowStory
                  onRun={handleSplitAction}
                  onStop={() => void cancelVisualRun()}
                />
                <PopoverProvider
                  ariaLabel="More actions"
                  placement="bottom-end"
                  padding={0}
                  visible={moreMenuOpen}
                  onVisibleChange={setMoreMenuOpen}
                  popover={() => (
                    <div style={{ minWidth: 190 }}>
                      <ActionList>
                        <ActionList.Item>
                          <ActionList.Action
                            ariaLabel="Update baselines"
                            disabled={busy || !storyId}
                            onClick={() => {
                              setMoreMenuOpen(false);
                              void handleUpdateBaselines();
                            }}
                          >
                            <ActionList.Icon>
                              <SyncIcon />
                            </ActionList.Icon>
                            <ActionList.Text>
                              {isUpdating
                                ? "Updating…"
                                : "Update baselines"}
                            </ActionList.Text>
                          </ActionList.Action>
                        </ActionList.Item>
                        <ActionList.Item>
                          <ActionList.Action
                            ariaLabel="Reset settings"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              resetSettings();
                            }}
                          >
                            <ActionList.Icon>
                              <UndoIcon />
                            </ActionList.Icon>
                            <ActionList.Text>Reset settings</ActionList.Text>
                          </ActionList.Action>
                        </ActionList.Item>
                      </ActionList>
                    </div>
                  )}
                >
                  <IconButton
                    size="small"
                    variant="ghost"
                    padding="small"
                    ariaLabel="More actions"
                    title="More actions"
                  >
                    <EllipsisIcon />
                  </IconButton>
                </PopoverProvider>
              </Actions>
            </ToolbarRow>
            {captureError ? <ErrorText>{captureError}</ErrorText> : null}
            {updateLog ? (
              <pre
                ref={updateLogRef}
                className="font-mono"
                style={{
                  margin: 0,
                  color: captureError
                    ? theme.color.negative
                    : theme.color.positive,
                  whiteSpace: "pre-wrap",
                  maxHeight: isUpdating || isCreating ? 220 : 120,
                  overflow: "auto",
                  fontSize: 11,
                  fontFamily: theme.typography.fonts.mono,
                }}
              >
                {updateLog.slice(-(isUpdating || isCreating ? 4000 : 800))}
              </pre>
            ) : null}
          </Toolbar>
          {diffResult && <DiffResult result={diffResult} />}
        </>
      )}
    </AddonPanel>
  );
});
