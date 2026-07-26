import React from "react";
import { styled } from "storybook/theming";
import type { DiffResultData } from "../types.js";
import { CompareView } from "./CompareView.js";
import { DiffHistogram } from "./DiffHistogram.js";
import { DiffResultContainer, DiffSummary } from "./styled.js";

const CaptureDiagnostics = styled.details(({ theme }) => ({
  flex: "0 0 auto",
  margin: "0 12px 8px",
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  lineHeight: 1.4,
  "& summary": {
    cursor: "pointer",
    fontWeight: theme.typography.weight.bold,
  },
  "& code": {
    display: "block",
    marginTop: 4,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
}));

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
      {result.sizeNote ? (
        <CaptureDiagnostics data-testid="diff-capture-diagnostics">
          <summary>Capture diagnostics</summary>
          <code>{result.sizeNote}</code>
        </CaptureDiagnostics>
      ) : null}
    </DiffResultContainer>
  );
}
