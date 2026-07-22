import React from "react";
import type { DiffResultData } from "../types.js";
import { CompareView } from "./CompareView.js";
import { DiffHistogram } from "./DiffHistogram.js";
import { DiffResultContainer, DiffSummary } from "./styled.js";

export function DiffResult({
  result,
  showHistogram = false,
}: {
  result: DiffResultData;
  showHistogram?: boolean;
}) {
  return (
    <DiffResultContainer>
      {showHistogram ? (
        <DiffSummary>
          <DiffHistogram bins={result.diffHistogram ?? []} />
        </DiffSummary>
      ) : null}
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
