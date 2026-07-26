import React from "react";
import { styled } from "storybook/theming";

export type PanelResultState =
  | "setup"
  | "skipped"
  | "missing"
  | "ready"
  | "running"
  | "passed"
  | "failed"
  | "error";

const Root = styled.div<{ $state: PanelResultState }>(({ theme, $state }) => {
  const color =
    $state === "passed"
      ? theme.color.positive
      : $state === "failed" || $state === "error"
        ? theme.color.negative
        : $state === "running" || $state === "setup" || $state === "missing"
          ? theme.color.warning
          : theme.textMutedColor;
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    padding: "6px 16px",
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: theme.background.content,
    color: theme.color.defaultText,
    fontSize: theme.typography.size.s1,
    boxSizing: "border-box",
    "&::before": {
      content: '""',
      width: 8,
      height: 8,
      flexShrink: 0,
      borderRadius: "50%",
      background: color,
      boxShadow:
        $state === "running"
          ? `0 0 0 3px ${theme.background.hoverable}`
          : "none",
    },
  };
});

const Title = styled.strong(({ theme }) => ({
  fontSize: theme.typography.size.s2,
  whiteSpace: "nowrap",
}));

const Detail = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Meta = styled.span(({ theme }) => ({
  marginLeft: "auto",
  color: theme.textMutedColor,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
}));

export function PanelResultSummary({
  state,
  title,
  detail,
  finishedAt,
  modeSummary,
}: {
  state: PanelResultState;
  title: string;
  detail?: string | null;
  finishedAt?: number | null;
  modeSummary?: string | null;
}) {
  const time = finishedAt
    ? `${new Date(finishedAt).toISOString().slice(11, 16)} UTC`
    : null;
  const accessibleSummary = [
    title,
    detail,
    modeSummary,
    time && `Finished ${time}`,
  ]
    .filter(Boolean)
    .map((part) => String(part).replace(/[.!?]+$/, ""))
    .join(". ");
  return (
    <Root
      $state={state}
      role="status"
      aria-label={accessibleSummary}
      aria-live={state === "running" ? "polite" : "off"}
      data-result-state={state}
    >
      <Title>{title}</Title>
      {detail ? <Detail title={detail}>{detail}</Detail> : null}
      {modeSummary || time ? (
        <Meta>
          {[modeSummary, time ? `Finished ${time}` : null]
            .filter(Boolean)
            .join(" · ")}
        </Meta>
      ) : null}
    </Root>
  );
}
