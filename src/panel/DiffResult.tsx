import React from "react";
import type { DiffResultData } from "../types.js";
import { CompareView } from "./CompareView.js";
import { DiffResultContainer, DiffStats, DiffStatus } from "./styled.js";

export function DiffResult({ result }: { result: DiffResultData }) {
  const threshold = result.passThresholdPercent ?? 0.1;
  return (
    <DiffResultContainer>
      <DiffStats>
        <DiffStatus passed={result.passed}>
          {result.passed ? "✓ Passed" : "✗ Diff found"}
        </DiffStatus>
        {" — "}
        Diff pixels: {result.diffPixels} / {result.totalPixels} (
        {result.diffPercent.toFixed(4)}%) · pass if &lt; {threshold}%
        {result.sizeNote ? ` · ${result.sizeNote}` : null}
      </DiffStats>
      <CompareView
        baselineSrc={result.baselineImage}
        actualSrc={result.actualImage}
        diffSrc={result.diffImage}
        focusSrc={result.focusImage}
        changeBounds={result.changeBounds}
        imageWidth={result.imageWidth}
        imageHeight={result.imageHeight}
      />
    </DiffResultContainer>
  );
}
