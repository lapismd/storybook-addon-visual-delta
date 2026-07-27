import React from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { BaselineGeometryMismatch } from "../constants.js";
import type { BaselineAlignmentMismatch } from "../shared/story-config.js";

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

const ActionRow = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
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

export function BaselineAlignmentWarning({
  mismatch,
  onOpenConfiguration,
}: {
  mismatch: BaselineAlignmentMismatch;
  onOpenConfiguration: () => void;
}) {
  const baseline = `${mismatch.baselineCss.width}×${mismatch.baselineCss.height}`;
  const configured =
    mismatch.configured === "canvas" ? "Story canvas" : "Capture viewport";
  const recommended =
    mismatch.recommended === "canvas" ? "Story canvas" : "Capture viewport";
  return (
    <Root
      role="alert"
      aria-label={`Baseline alignment mismatch. ${baseline} CSS pixel baseline is configured as ${configured}; use ${recommended}.`}
      data-testid="baseline-alignment-warning"
    >
      <Title>Baseline alignment does not match this capture</Title>
      <ActionRow>
        <Detail>
          The {baseline} CSS px baseline is configured as {configured}. Use{" "}
          {recommended} to describe its capture geometry.
        </Detail>
        <Button
          size="small"
          variant="outline"
          ariaLabel="Review story alignment configuration"
          onClick={onOpenConfiguration}
        >
          Review configuration
        </Button>
      </ActionRow>
    </Root>
  );
}

export function BaselineGeometryUnavailable({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  return (
    <Root
      role="status"
      aria-label="Baseline geometry is unavailable"
      data-testid="baseline-geometry-unavailable"
    >
      <Title>Baseline geometry unavailable</Title>
      <ActionRow>
        <Detail>
          The preview did not settle enough to measure this baseline. The prior
          warning was cleared.
        </Detail>
        <Button
          size="small"
          variant="outline"
          ariaLabel="Retry baseline geometry measurement"
          title={detail}
          onClick={onRetry}
        >
          Retry
        </Button>
      </ActionRow>
    </Root>
  );
}
