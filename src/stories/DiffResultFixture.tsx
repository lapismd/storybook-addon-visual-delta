import React from "react";
import { DEFAULT_PASS_THRESHOLD_PERCENT } from "../constants.js";
import type { DiffResultData } from "../types.js";
import { DiffResult } from "../panel/DiffResult.js";

function svgData(
  width: number,
  height: number,
  label: string,
  background: string,
) {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="${background}"/>
      <path d="M0 ${height / 2}H${width}M${width / 2} 0V${height}" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(width / 500))}" opacity=".55"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui" font-size="${Math.max(28, Math.round(width / 18))}" font-weight="700">${label}</text>
    </svg>`,
  )}`;
}

export function diffResultFixture(
  cssWidth: number,
  cssHeight: number,
  label: string,
): DiffResultData {
  const scale = 3;
  const imageWidth = cssWidth * scale;
  const imageHeight = cssHeight * scale;
  const viewport = { width: cssWidth, height: cssHeight };
  return {
    baselineImage: svgData(
      imageWidth,
      imageHeight,
      `${label} baseline`,
      "#2563eb",
    ),
    actualImage: svgData(imageWidth, imageHeight, `${label} latest`, "#7c3aed"),
    diffImage: svgData(imageWidth, imageHeight, `${label} diff`, "#dc2626"),
    focusImage: svgData(imageWidth, imageHeight, `${label} focus`, "#059669"),
    changeBounds: {
      x: imageWidth * 0.3,
      y: imageHeight * 0.3,
      width: imageWidth * 0.4,
      height: imageHeight * 0.4,
    },
    imageWidth,
    imageHeight,
    cssWidth,
    cssHeight,
    deviceScaleFactor: scale,
    captureViewport: viewport,
    observedCaptureViewport: viewport,
    capturedBitmap: { width: imageWidth, height: imageHeight },
    diffPixels: 128,
    totalPixels: imageWidth * imageHeight,
    diffPercent: (128 / (imageWidth * imageHeight)) * 100,
    passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT,
    passed: true,
    sizeNote:
      `html-to-image · viewport requested ${cssWidth}×${cssHeight}, ` +
      `observed ${cssWidth}×${cssHeight} at 3× · bitmap ${imageWidth}×${imageHeight}`,
    diffHistogram: [0, 1, 3, 8, 13, 8, 3, 1],
  };
}

export function DiffResultFixture({
  cssWidth,
  cssHeight,
  label,
}: {
  cssWidth: number;
  cssHeight: number;
  label: string;
}) {
  return <DiffResult result={diffResultFixture(cssWidth, cssHeight, label)} />;
}
