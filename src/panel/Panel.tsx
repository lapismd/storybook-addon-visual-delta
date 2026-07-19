import React, { memo, useCallback, useEffect, useState } from "react";
import pixelmatch from "pixelmatch";
import { AddonPanel } from "storybook/internal/components";
import { useTheme } from "storybook/theming";
import { DEFAULT_PASS_THRESHOLD_PERCENT } from "../constants.js";
import type { DiffResultData } from "../types.js";
import {
  capturePreviewIframe,
  fitImageData,
  loadImage,
  maskTransparentRegions,
} from "./capture.js";
import { buildFocusAssets } from "./diff-assets.js";
import { DiffResult } from "./DiffResult.js";
import {
  useOverlayHidden,
  useOverlayInfo,
  useStoryData,
} from "./hooks.js";
import { ImageGallery } from "./ImageGallery.js";
import {
  Actions,
  Checkbox,
  CheckboxContainer,
  ControlsRow,
  DiffButton,
  EmptyState,
  EmptyStateContainer,
  ErrorText,
  GhostButton,
  InlineControl,
  Slider,
  Toolbar,
  ValueDisplay,
} from "./styled.js";

export const Panel = memo(function Panel(props: { active?: boolean }) {
  const theme = useTheme();
  const [captureError, setCaptureError] = useState<string | null>(null);
  const {
    images,
    index,
    storyId,
    opacity,
    colorInversion,
    passThresholdPercent,
    setIndex,
    setOpacity,
    setColorInversion,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
  } = useStoryData();
  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);

  useEffect(() => {
    setDiffResult(null);
    setCaptureError(null);
  }, [index, storyId]);

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
      let capture: Awaited<ReturnType<typeof capturePreviewIframe>>;
      try {
        // Match Playwright baseline viewport so layout isn't the manager pane size.
        capture = await capturePreviewIframe({
          width: baseline.width,
          height: baseline.height,
        });
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
      const totalPixels = width * height;
      const diffPercent = (diffPixels / totalPixels) * 100;
      const threshold =
        passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
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
        passed: diffPercent < threshold,
        sizeNote,
      });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Diff failed");
    } finally {
      setIsDiffing(false);
    }
  }, [
    index,
    images,
    passThresholdPercent,
    getOverlayInfo,
    waitForOverlayHidden,
    hideOverlay,
    showOverlay,
  ]);

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
            <ImageGallery
              images={images}
              selectedIndex={index}
              onSelect={setIndex}
            />
            <ControlsRow>
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
              <CheckboxContainer>
                <Checkbox
                  type="checkbox"
                  checked={colorInversion}
                  onChange={(e) => setColorInversion(e.target.checked)}
                />
                <span>Blend</span>
              </CheckboxContainer>
              <Actions>
                <GhostButton
                  type="button"
                  onClick={resetOverlay}
                  disabled={index === -1}
                  title="Reset overlay position after drag"
                >
                  Reset
                </GhostButton>
                <DiffButton
                  type="button"
                  onClick={handleDiff}
                  disabled={isDiffing || index === -1}
                >
                  {isDiffing ? "Diffing…" : "Run Diff"}
                </DiffButton>
              </Actions>
              {captureError ? <ErrorText>{captureError}</ErrorText> : null}
            </ControlsRow>
          </Toolbar>
          {diffResult && <DiffResult result={diffResult} />}
        </>
      )}
    </AddonPanel>
  );
});
