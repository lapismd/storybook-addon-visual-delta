import React, { useState } from "react";
import { GraphBarIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import type { DiffResultData } from "../types.js";
import { CompareView } from "./CompareView.js";
import { DiffHistogram } from "./DiffHistogram.js";
import {
  DiffResultContainer,
  DiffStatus,
  DiffSummary,
  DiffSummaryDetail,
  DiffSummaryMeta,
  DiffSummaryRow,
  DiffToolLabel,
} from "./styled.js";

export function DiffResult({ result }: { result: DiffResultData }) {
  const threshold = result.passThresholdPercent ?? 0.1;
  const [showHistogram, setShowHistogram] = useState(false);

  return (
    <DiffResultContainer>
      <DiffSummary>
        <DiffSummaryRow>
          <DiffSummaryMeta>
            <DiffStatus passed={result.passed}>
              {result.passed ? "✓ Passed" : "✗ Diff found"}
            </DiffStatus>
            <DiffSummaryDetail>
              {result.diffPercent.toFixed(4)}% changed · {result.diffPixels} /{" "}
              {result.totalPixels} px · pass if &lt; {threshold}%
              {result.sizeNote ? ` · ${result.sizeNote}` : null}
            </DiffSummaryDetail>
          </DiffSummaryMeta>
          <ToggleButton
            size="small"
            pressed={showHistogram}
            onClick={() => setShowHistogram((v) => !v)}
            aria-label="Toggle difference distribution"
            aria-expanded={showHistogram}
            title="Difference distribution"
          >
            <DiffToolLabel>
              <GraphBarIcon />
              Distribution
            </DiffToolLabel>
          </ToggleButton>
        </DiffSummaryRow>
        {showHistogram ? (
          <DiffHistogram bins={result.diffHistogram ?? []} />
        ) : null}
      </DiffSummary>
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
