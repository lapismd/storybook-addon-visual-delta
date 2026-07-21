import React, { memo, useCallback, useEffect, useState } from "react";
import {
  EllipsisIcon,
  SyncIcon,
  UndoIcon,
} from "@storybook/icons";
import pixelmatch from "pixelmatch";
import {
  ActionList,
  AddonPanel,
  IconButton,
  PopoverProvider,
  ToggleButton,
} from "storybook/internal/components";
import {
  experimental_getTestProviderStore,
  useStorybookApi,
} from "storybook/manager-api";
import { useTheme } from "storybook/theming";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  TEST_PROVIDER_ID,
  VISUAL_DELTA_UPDATE_PATH,
  isSplitPlacement,
} from "../constants.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  componentStoryIdsFor,
  formatVisualProgressLabel,
  postVisualRun,
  publishVisualLastRun,
  subscribeVisualRunProgress,
  visualResultFromLiveDiff,
  visualRunnableStoryIds,
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
import { PlacementPad } from "./PlacementPad.js";
import {
  Actions,
  ButtonGroup,
  Checkbox,
  CheckboxContainer,
  EmptyState,
  EmptyStateContainer,
  ErrorText,
  InlineControl,
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
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const {
    images,
    index,
    storyId,
    opacity,
    colorInversion,
    placement,
    passThresholdPercent,
    setIndex,
    setOpacity,
    setColorInversion,
    togglePlacement,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    reloadBaselineImages,
  } = useStoryData();
  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRunningVisual, setIsRunningVisual] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
  /** Bumped after a Playwright visual run so we reload sidecar artifacts. */
  const [diffEpoch, setDiffEpoch] = useState(0);
  const [runProgress, setRunProgress] = useState<VisualRunProgress | null>(
    null,
  );
  const isSplit = isSplitPlacement(placement);
  const busy = isDiffing || isUpdating || isRunningVisual;
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
    setIsUpdating(true);
    setCaptureError(null);
    setUpdateLog(null);
    try {
      const response = await fetch(VISUAL_DELTA_UPDATE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const text = await response.text();
      setUpdateLog(text.trim() || null);
      if (!response.ok) {
        throw new Error(text.trim() || `Update failed (${response.status})`);
      }
      const exitMatch = text.match(/\[exit (\d+)\]/);
      if (exitMatch && exitMatch[1] !== "0") {
        throw new Error(`Baseline update exited with code ${exitMatch[1]}`);
      }
      reloadBaselineImages();
      setDiffResult(null);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Baseline update failed",
      );
    } finally {
      setIsUpdating(false);
    }
  }, [storyId, reloadBaselineImages]);

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
      {images.length === 0 ? (
        <EmptyStateContainer>
          <EmptyState style={{ color: theme.color.mediumdark }}>
            Configure images in the story parameters.visualDelta.images
          </EmptyState>
        </EmptyStateContainer>
      ) : (
        <>
          <Toolbar>
            <ToolbarRow>
              <ImageGallery
                images={images}
                selectedIndex={index}
                onSelect={setIndex}
              />
              <PlacementPad
                value={placement}
                active={index >= 0}
                onToggle={togglePlacement}
                disabled={images.length === 0}
              />
              {!isSplit ? (
                <ButtonGroup role="group" aria-label="Overlay controls">
                  <ToggleButton
                    size="small"
                    pressed={false}
                    disabled={index === -1}
                    onClick={resetOverlay}
                    aria-label="Reset overlay position after drag"
                    title="Reset overlay position after drag"
                  >
                    Reset
                  </ToggleButton>
                </ButtonGroup>
              ) : null}
              <ToolbarSpacer />
              {!isSplit ? (
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
            {updateLog && !captureError ? (
              <pre
                style={{
                  margin: 0,
                  color: theme.color.positive,
                  whiteSpace: "pre-wrap",
                  maxHeight: 120,
                  overflow: "auto",
                  fontSize: 11,
                }}
              >
                {updateLog.slice(-800)}
              </pre>
            ) : null}
          </Toolbar>
          {diffResult && <DiffResult result={diffResult} />}
        </>
      )}
    </AddonPanel>
  );
});
