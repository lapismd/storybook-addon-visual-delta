import React from "react";
import { styled } from "storybook/theming";
import type { BaselineGeometryMismatch } from "../constants.js";

const Root = styled.div(({ theme }) => ({
  display: "grid",
  gap: 3,
  padding: "8px 16px",
  borderBottom: `1px solid ${theme.color.warning}`,
  background: theme.background.hoverable,
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s1,
  boxSizing: "border-box",
}));

const Title = styled.strong(({ theme }) => ({
  color:
    theme.base === "light"
      ? `color-mix(in srgb, ${theme.color.warning} 60%, black)`
      : theme.color.warning,
  fontSize: theme.typography.size.s2,
}));

const Detail = styled.span({
  lineHeight: 1.4,
});

export function BaselineGeometryWarning({
  mismatch,
}: {
  mismatch: BaselineGeometryMismatch;
}) {
  const baseline = `${mismatch.baselineCss.width}×${mismatch.baselineCss.height}`;
  const live = `${mismatch.liveCss.width}×${mismatch.liveCss.height}`;
  const viewport = `${mismatch.captureViewport.width}×${mismatch.captureViewport.height}`;
  return (
    <Root
      role="alert"
      aria-label={`Baseline geometry mismatch. Baseline ${baseline} CSS pixels; live component ${live} CSS pixels at viewport ${viewport}.`}
      data-testid="baseline-geometry-warning"
    >
      <Title>Baseline geometry mismatch</Title>
      <Detail>
        Baseline {baseline} CSS px; live component {live} CSS px at the{" "}
        {viewport} capture viewport. The baseline may be stale or incompatible;
        review it before updating.
      </Detail>
    </Root>
  );
}
