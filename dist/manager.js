import { ADDON_ID, PANEL_ID, EVENTS } from './chunk-DSQ5HHBF.js';
import React, { memo, useCallback, useState, useEffect, useRef } from 'react';
import { addons, types, useChannel } from 'storybook/manager-api';
import pixelmatch from 'pixelmatch';
import { toPng } from 'html-to-image';
import { AddonPanel } from 'storybook/internal/components';
import { styled, useTheme } from 'storybook/theming';

var DiffResultContainer = styled.div({
  padding: "1rem",
  borderTop: "1px solid #e0e0e0",
  backgroundColor: "#ffffff"
});
var DiffLayout = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem"
});
var Row = styled.div({
  display: "flex",
  gap: "0.75rem"
});
var Card = styled.div(({ theme }) => ({
  flex: 1,
  border: "1px solid #e0e0e0",
  backgroundColor: "#fff",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.background?.hoverable || "#f5f5f5"
  }
}));
var FullWidthCard = styled(Card)({
  width: "100%"
});
var CardHeader = styled.div(({ theme }) => ({
  padding: "0.5rem",
  fontSize: "12px",
  fontWeight: 600,
  color: theme.color.defaultText,
  textAlign: "center",
  borderBottom: "1px solid #e0e0e0",
  backgroundColor: "#f5f5f5"
}));
var CardBody = styled.div({
  padding: "1rem"
});
var DiffImageContainer = styled.div({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "200px",
  width: "100%"
});
var DiffResultImage = styled.img({
  maxWidth: "100%",
  maxHeight: "400px",
  width: "100%",
  height: "100%",
  display: "block",
  margin: "0 auto",
  transition: "transform 0.2s ease",
  "&:hover": {
    transform: "scale(1.02)"
  }
});
var DiffStats = styled.div(({ theme }) => ({
  marginTop: "1rem",
  fontSize: "12px",
  color: theme.color.defaultText,
  textAlign: "center"
}));
var DiffStatus = styled.span(({ passed, theme }) => ({
  fontWeight: 600,
  color: passed ? theme.color.positive : theme.color.negative
}));
var DiffResult = ({ result }) => {
  const threshold = result.passThresholdPercent ?? 0.1;
  return /* @__PURE__ */ React.createElement(DiffResultContainer, null, /* @__PURE__ */ React.createElement(DiffLayout, null, /* @__PURE__ */ React.createElement(FullWidthCard, null, /* @__PURE__ */ React.createElement(CardHeader, null, "Diff result"), /* @__PURE__ */ React.createElement(CardBody, null, /* @__PURE__ */ React.createElement(DiffImageContainer, null, /* @__PURE__ */ React.createElement(DiffResultImage, { src: result.diffImage, alt: "Diff" })))), /* @__PURE__ */ React.createElement(Row, null, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardHeader, null, "Baseline"), /* @__PURE__ */ React.createElement(CardBody, null, /* @__PURE__ */ React.createElement(DiffImageContainer, null, /* @__PURE__ */ React.createElement(DiffResultImage, { src: result.baselineImage, alt: "Baseline" })))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement(CardHeader, null, "Actual screenshot"), /* @__PURE__ */ React.createElement(CardBody, null, /* @__PURE__ */ React.createElement(DiffImageContainer, null, /* @__PURE__ */ React.createElement(DiffResultImage, { src: result.actualImage, alt: "Actual" })))))), /* @__PURE__ */ React.createElement(DiffStats, null, /* @__PURE__ */ React.createElement(DiffStatus, { passed: result.passed }, result.passed ? "✓ Passed" : "✗ Diff found"), " — ", "Diff pixels: ", result.diffPixels, " / ", result.totalPixels, " (", result.diffPercent.toFixed(4), "%)", " · pass if < ", threshold, "%"));
};
var GalleryContainer = styled.div({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  backgroundColor: "#ffffff"
});
var ImagesScrollContainer = styled.div({
  display: "flex",
  gap: "1rem",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "0.5rem 0",
  // 自定义滚动条样式
  "&::-webkit-scrollbar": {
    height: "2px"
  },
  "&::-webkit-scrollbar-track": {
    background: "#f1f1f1",
    borderRadius: "4px"
  },
  "&::-webkit-scrollbar-thumb": {
    background: "#888",
    borderRadius: "4px",
    "&:hover": {
      background: "#555"
    }
  }
});
var ImageWrapper = styled.div(({ selected, theme }) => ({
  position: "relative",
  flexShrink: 0,
  cursor: "pointer",
  width: "100px",
  height: "80px",
  border: selected ? `1px solid ${theme.color.secondary}` : "1px solid #ddd",
  borderRadius: "8px",
  padding: "4px",
  transition: "all 0.2s ease",
  backgroundColor: selected ? theme.background.hoverable : "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "&:hover": {
    borderColor: theme.color.secondary,
    backgroundColor: theme.background.hoverable
  }
}));
var Image2 = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain"
});
var ImageGallery = memo(function ImageGallery2({
  images,
  selectedIndex,
  onSelect
}) {
  const handleImageClick = useCallback(
    (index) => {
      onSelect(index === selectedIndex ? -1 : index);
    },
    [selectedIndex, onSelect]
  );
  return /* @__PURE__ */ React.createElement(GalleryContainer, null, /* @__PURE__ */ React.createElement(ImagesScrollContainer, null, images.map((imageItem, index) => /* @__PURE__ */ React.createElement(
    ImageWrapper,
    {
      key: index,
      selected: selectedIndex === index,
      onClick: () => handleImageClick(index),
      title: `Select image ${index + 1}`
    },
    /* @__PURE__ */ React.createElement(Image2, { src: imageItem.src, alt: `Baseline ${index + 1}` })
  ))));
});
var OVERLAY_INFO_EVENT = "visual-delta-overlay-info";
function useOverlayInfo() {
  const emitRef = useRef(null);
  const emit = useChannel({
    [EVENTS.OVERLAY_INFO]: (data) => {
      const { requestId, ...overlayInfo } = data;
      const customEvent = new CustomEvent(OVERLAY_INFO_EVENT, {
        detail: {
          requestId,
          overlayInfo
        }
      });
      window.dispatchEvent(customEvent);
    }
  });
  emitRef.current = emit;
  const getOverlayInfo = useCallback(() => {
    return new Promise((resolve, reject) => {
      const requestId = `overlay-info-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        window.removeEventListener(OVERLAY_INFO_EVENT, handler);
        reject(new Error("Timed out waiting for overlay position info"));
      }, 5e3);
      const handler = (event) => {
        const customEvent = event;
        if (customEvent.detail?.requestId === requestId) {
          window.removeEventListener(OVERLAY_INFO_EVENT, handler);
          clearTimeout(timeout);
          resolve(customEvent.detail.overlayInfo);
        }
      };
      window.addEventListener(OVERLAY_INFO_EVENT, handler);
      if (emitRef.current) {
        emitRef.current(EVENTS.REQUEST_OVERLAY_INFO, { requestId });
      }
    });
  }, []);
  return { getOverlayInfo };
}
var OVERLAY_HIDDEN_EVENT = "visual-delta-overlay-hidden";
function useOverlayHidden() {
  const emitRef = useRef(null);
  const emit = useChannel({
    [EVENTS.OVERLAY_HIDDEN]: () => {
      const customEvent = new CustomEvent(OVERLAY_HIDDEN_EVENT);
      window.dispatchEvent(customEvent);
    }
  });
  emitRef.current = emit;
  const waitForOverlayHidden = useCallback(() => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener(OVERLAY_HIDDEN_EVENT, handler);
        reject(new Error("Timed out waiting for overlay to hide"));
      }, 5e3);
      const handler = () => {
        window.removeEventListener(OVERLAY_HIDDEN_EVENT, handler);
        clearTimeout(timeout);
        resolve();
      };
      window.addEventListener(OVERLAY_HIDDEN_EVENT, handler);
    });
  }, []);
  return { waitForOverlayHidden };
}
var DEFAULT_PASS_THRESHOLD_PERCENT = 0.1;
function useStoryData() {
  const [storyData, setStoryData] = useState({
    images: [],
    storyId: "",
    storyName: "",
    index: -1,
    opacity: 0.5,
    colorInversion: true,
    passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT
  });
  const emitRef = useRef(null);
  const emit = useChannel({
    [EVENTS.INIT_IMAGE]: (data) => {
      const imagesArray = Array.isArray(data.images) ? data.images : [data.images];
      const initialIndex = imagesArray.length > 0 ? 0 : -1;
      setStoryData(() => ({
        images: imagesArray,
        storyId: data.storyId,
        storyName: data.storyName,
        index: initialIndex,
        opacity: data.opacity ?? 0.5,
        colorInversion: data.colorInversion ?? true,
        passThresholdPercent: data.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT
      }));
      // Auto-select first baseline so the overlay appears without a thumbnail click
      if (initialIndex >= 0) {
        queueMicrotask(() => {
          if (emitRef.current) {
            emitRef.current(EVENTS.SELECT_IMAGE, { index: initialIndex, images: imagesArray });
          }
        });
      }
    }
  });
  emitRef.current = emit;
  const setIndex = useCallback((index) => {
    setStoryData((prev) => {
      if (emitRef.current) {
        emitRef.current(EVENTS.SELECT_IMAGE, { index, images: prev.images });
      }
      return {
        ...prev,
        index
      };
    });
  }, []);
  const setOpacity = useCallback((opacity) => {
    setStoryData((prev) => {
      if (emitRef.current) {
        emitRef.current(EVENTS.UPDATE_OVERLAY_STYLE, { opacity, colorInversion: prev.colorInversion });
      }
      return {
        ...prev,
        opacity
      };
    });
  }, []);
  const setColorInversion = useCallback((colorInversion) => {
    setStoryData((prev) => {
      if (emitRef.current) {
        emitRef.current(EVENTS.UPDATE_OVERLAY_STYLE, { opacity: prev.opacity, colorInversion });
      }
      return {
        ...prev,
        colorInversion
      };
    });
  }, []);
  const setPassThresholdPercent = useCallback((passThresholdPercent) => {
    setStoryData((prev) => ({
      ...prev,
      passThresholdPercent
    }));
  }, []);
  const hideOverlay = useCallback(() => {
    if (emitRef.current) {
      emitRef.current(EVENTS.HIDE_OVERLAY, {});
    }
  }, []);
  const showOverlay = useCallback(() => {
    if (emitRef.current) {
      emitRef.current(EVENTS.SHOW_OVERLAY, {});
    }
  }, []);
  return {
    ...storyData,
    setIndex,
    setOpacity,
    setColorInversion,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay
  };
}

// src/components/Panel/utils.ts
/**
 * Capture the Storybook preview iframe (same-origin) as a PNG data URL.
 * Upstream relied on a Chrome extension (`HIYA_EXTENSION_*`) that is not
 * available in normal Storybook — so Run Diff hung forever.
 */
async function capturePreviewIframe() {
  const iframe = document.getElementById("storybook-preview-iframe");
  if (!(iframe instanceof HTMLIFrameElement)) {
    throw new Error("Storybook preview iframe not found");
  }
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc?.documentElement || !win) {
    throw new Error("Cannot access preview document (cross-origin or not ready)");
  }
  const width = Math.ceil(
    Math.max(
      doc.documentElement.scrollWidth,
      doc.body?.scrollWidth ?? 0,
      win.innerWidth
    )
  );
  const height = Math.ceil(
    Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
      win.innerHeight
    )
  );
  if (width < 1 || height < 1) {
    throw new Error("Preview document has zero size");
  }
  try {
    return await toPng(doc.documentElement, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      cacheBust: true,
      skipAutoScale: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to capture preview: ${message}`);
  }
}
/** Fit actual → baseline size without stretching (pad with transparent / crop). */
function fitImageData(imgData, targetWidth, targetHeight) {
  if (imgData.width === targetWidth && imgData.height === targetHeight) {
    return imgData.data;
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to get canvas context");
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imgData.width;
  tempCanvas.height = imgData.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("Unable to get temp canvas context");
  tempCtx.putImageData(imgData, 0, 0);
  ctx.drawImage(tempCanvas, 0, 0);
  return ctx.getImageData(0, 0, targetWidth, targetHeight).data;
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({
        imageData: ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight),
        dataUrl: canvas.toDataURL("image/png"),
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

// src/components/Panel/index.tsx
var EmptyState = styled.p({
  textAlign: "center",
  padding: "2rem"
});
var EmptyStateContainer = styled.div({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  backgroundColor: "#ffffff",
  minHeight: "100%"
});
var ControlsContainer = styled.div({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  borderTop: "1px solid #e0e0e0",
  backgroundColor: "#ffffff"
});
var ControlRow = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem"
});
var ControlLabel = styled.label(({ theme }) => ({
  fontSize: "12px",
  fontWeight: 600,
  color: theme.color.defaultText,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between"
}));
var Slider = styled.input({
  width: "100%",
  height: "4px",
  borderRadius: "2px",
  outline: "none",
  cursor: "pointer",
  "&::-webkit-slider-thumb": {
    appearance: "none",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#1ea7fd",
    cursor: "pointer"
  },
  "&::-moz-range-thumb": {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#1ea7fd",
    cursor: "pointer",
    border: "none"
  }
});
var CheckboxContainer = styled.label({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: "pointer",
  userSelect: "none"
});
var Checkbox = styled.input({
  width: "16px",
  height: "16px",
  cursor: "pointer"
});
var DIFF_ALPHA_IGNORE_THRESHOLD = 8;
var DIFF_ALPHA_IGNORE_DILATE_RADIUS = 1;
function maskTransparentRegions(baselineData, actualData, width, height, alphaThreshold = DIFF_ALPHA_IGNORE_THRESHOLD, dilateRadius = DIFF_ALPHA_IGNORE_DILATE_RADIUS) {
  const baselineForDiff = new Uint8ClampedArray(baselineData);
  const actualForDiff = new Uint8ClampedArray(actualData);
  const ignore = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const a = baselineForDiff[p * 4 + 3];
    if (a <= alphaThreshold) ignore[p] = 1;
  }
  if (dilateRadius > 0) {
    const expanded = new Uint8Array(ignore);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!ignore[idx]) continue;
        const y0 = Math.max(0, y - dilateRadius);
        const y1 = Math.min(height - 1, y + dilateRadius);
        const x0 = Math.max(0, x - dilateRadius);
        const x1 = Math.min(width - 1, x + dilateRadius);
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            expanded[yy * width + xx] = 1;
          }
        }
      }
    }
    ignore.set(expanded);
  }
  for (let p = 0; p < width * height; p++) {
    if (!ignore[p]) continue;
    const i = p * 4;
    baselineForDiff[i] = 0;
    baselineForDiff[i + 1] = 0;
    baselineForDiff[i + 2] = 0;
    baselineForDiff[i + 3] = 0;
    actualForDiff[i] = 0;
    actualForDiff[i + 1] = 0;
    actualForDiff[i + 2] = 0;
    actualForDiff[i + 3] = 0;
  }
  return { baselineForDiff, actualForDiff, ignore };
}
var ValueDisplay = styled.span(({ theme }) => ({
  fontSize: "12px",
  color: theme.color.mediumdark,
  minWidth: "40px",
  textAlign: "right"
}));
var DiffButton = styled.button(({ theme }) => ({
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#fff",
  backgroundColor: theme.color.secondary,
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  transition: "background-color 0.2s",
  "&:hover": {
    backgroundColor: theme.color.positive
  },
  "&:disabled": {
    backgroundColor: theme.color.mediumdark,
    cursor: "not-allowed"
  }
}));
var Panel = memo(function MyPanel(props) {
  const theme = useTheme();
  const [captureError, setCaptureError] = useState(null);
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
    showOverlay
  } = useStoryData();
  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [diffResult, setDiffResult] = useState(null);
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
        throw new Error("Unable to get baseline image; make sure an image is selected");
      }
      const baseline = await loadImage(currentOverlayInfo.image.src);
      // Register listener before hide — OVERLAY_HIDDEN can fire on the next frames
      const overlayHidden = waitForOverlayHidden();
      hideOverlay();
      await overlayHidden;
      let actualDataUrl;
      try {
        actualDataUrl = await capturePreviewIframe();
      } finally {
        showOverlay();
      }
      const actual = await loadImage(actualDataUrl);
      const width = baseline.width;
      const height = baseline.height;
      const baselineData = baseline.imageData.data;
      const actualData = fitImageData(actual.imageData, width, height);
      const { baselineForDiff, actualForDiff, ignore } = maskTransparentRegions(baselineData, actualData, width, height);
      const actualMaskedCanvas = document.createElement("canvas");
      actualMaskedCanvas.width = width;
      actualMaskedCanvas.height = height;
      const actualMaskedCtx = actualMaskedCanvas.getContext("2d");
      if (!actualMaskedCtx) throw new Error("Unable to get canvas context");
      const actualMaskedImageData = actualMaskedCtx.createImageData(width, height);
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
      const diffPixels = pixelmatch(actualForDiff, baselineForDiff, diffData, width, height, {
        threshold: 0.2,
        includeAA: false,
        alpha: 0.1,
        diffColor: [255, 0, 0],
        diffColorAlt: [0, 255, 0]
      });
      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = width;
      diffCanvas.height = height;
      const ctx = diffCanvas.getContext("2d");
      if (!ctx) throw new Error("Unable to get canvas context");
      const diffImageData = ctx.createImageData(width, height);
      diffImageData.data.set(diffData);
      ctx.putImageData(diffImageData, 0, 0);
      const totalPixels = width * height;
      const diffPercent = diffPixels / totalPixels * 100;
      const threshold = passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
      setDiffResult({
        actualImage: actualMaskedDataUrl,
        diffImage: diffCanvas.toDataURL("image/png"),
        baselineImage: baseline.dataUrl,
        diffPixels,
        totalPixels,
        diffPercent,
        passThresholdPercent: threshold,
        passed: diffPercent < threshold
      });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Diff failed");
    } finally {
      setIsDiffing(false);
    }
  }, [index, images, passThresholdPercent, getOverlayInfo, waitForOverlayHidden, hideOverlay, showOverlay]);
  return /* @__PURE__ */ React.createElement(AddonPanel, { active: props.active ?? false }, images.length === 0 ? /* @__PURE__ */ React.createElement(EmptyStateContainer, null, /* @__PURE__ */ React.createElement(EmptyState, { style: { color: theme.color.mediumdark } }, "Configure images in the story parameters.visualDelta.images")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ImageGallery, { images, selectedIndex: index, onSelect: setIndex }), /* @__PURE__ */ React.createElement(ControlsContainer, null, /* @__PURE__ */ React.createElement(ControlRow, null, /* @__PURE__ */ React.createElement(ControlLabel, null, /* @__PURE__ */ React.createElement("span", null, "Opacity"), /* @__PURE__ */ React.createElement(ValueDisplay, null, Math.round(opacity * 100), "%")), /* @__PURE__ */ React.createElement(
    Slider,
    {
      type: "range",
      min: "0",
      max: "1",
      step: "0.01",
      value: opacity,
      onChange: (e) => setOpacity(parseFloat(e.target.value))
    }
  )), /* @__PURE__ */ React.createElement(ControlRow, null, /* @__PURE__ */ React.createElement(ControlLabel, null, /* @__PURE__ */ React.createElement("span", null, "Pass threshold"), /* @__PURE__ */ React.createElement(ValueDisplay, null, passThresholdPercent, "%")), /* @__PURE__ */ React.createElement(
    Slider,
    {
      type: "range",
      min: "0",
      max: "2",
      step: "0.05",
      value: passThresholdPercent,
      onChange: (e) => setPassThresholdPercent(parseFloat(e.target.value))
    }
  )), /* @__PURE__ */ React.createElement(ControlRow, null, /* @__PURE__ */ React.createElement(CheckboxContainer, null, /* @__PURE__ */ React.createElement(
    Checkbox,
    {
      type: "checkbox",
      checked: colorInversion,
      onChange: (e) => setColorInversion(e.target.checked)
    }
  ), /* @__PURE__ */ React.createElement("span", null, "Difference blend"))), /* @__PURE__ */ React.createElement(ControlRow, null, /* @__PURE__ */ React.createElement(DiffButton, { onClick: handleDiff, disabled: isDiffing || index === -1 }, isDiffing ? "Diffing..." : "Run Diff"), captureError && /* @__PURE__ */ React.createElement("p", { style: { color: "#ee0000", fontSize: "12px", margin: 0 } }, captureError))), diffResult && /* @__PURE__ */ React.createElement(DiffResult, { result: diffResult })));
});

// src/manager.tsx
addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Visual Delta",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => /* @__PURE__ */ React.createElement(Panel, { active })
  });
});
