import React, { memo } from "react";
import { Button } from "storybook/internal/components";
import { styled, useTheme } from "storybook/theming";
import type { VisualDeltaInteraction } from "../constants.js";
import type { PlayStepInfo } from "./usePlaySteps.js";

const List = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "8px 0",
  maxHeight: 220,
  overflow: "auto",
});

const Row = styled.button<{ selected?: boolean }>(({ theme, selected }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  textAlign: "left",
  border: `1px solid ${selected ? theme.color.secondary : theme.appBorderColor}`,
  borderRadius: 6,
  background: selected ? theme.background.hoverable : theme.background.content,
  color: theme.color.defaultText,
  padding: "8px 10px",
  cursor: "pointer",
  font: "inherit",
}));

const Thumb = styled.img({
  width: 48,
  height: 36,
  objectFit: "contain",
  borderRadius: 4,
  background: "transparent",
  flexShrink: 0,
});

const Meta = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
  flex: 1,
});

const Label = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Hint = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.textMutedColor,
}));

const Actions = styled.div({
  display: "flex",
  gap: 6,
  flexShrink: 0,
});

export const InteractionsPanel = memo(function InteractionsPanel({
  steps,
  interactions,
  selectedStepId,
  busy,
  onSelect,
  onCreate,
  onUpdate,
}: {
  steps: PlayStepInfo[];
  interactions: VisualDeltaInteraction[];
  selectedStepId: string | null;
  busy: boolean;
  onSelect: (step: PlayStepInfo) => void;
  onCreate: (step: PlayStepInfo) => void;
  onUpdate: (step: PlayStepInfo) => void;
}) {
  const theme = useTheme();
  const byId = new Map(interactions.map((item) => [item.id, item]));

  if (steps.length === 0) {
    return (
      <Hint style={{ padding: "12px 0" }}>
        No interactions yet. Add named{" "}
        <code>step(&quot;Label&quot;, …)</code> /{" "}
        <code>visualCapture(step, …)</code> in play, reload the story, then
        Create here — or wire{" "}
        <code>parameters.visualDelta.interactions</code> after a capture.
      </Hint>
    );
  }

  return (
    <List>
      {steps.map((step) => {
        const wired = byId.get(step.stepId);
        const selected = selectedStepId === step.stepId;
        return (
          <Row
            key={step.stepId}
            type="button"
            selected={selected}
            onClick={() => onSelect(step)}
            title={
              wired
                ? `Show baseline for “${step.label}”`
                : `Run through “${step.label}”`
            }
          >
            {wired ? (
              <Thumb src={wired.src} alt="" />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 36,
                  borderRadius: 4,
                  background: theme.background.hoverable,
                  flexShrink: 0,
                }}
              />
            )}
            <Meta>
              <Label>{step.label}</Label>
              <Hint>
                {wired ? "Baseline wired" : "No baseline yet"} · {step.stepId}
              </Hint>
            </Meta>
            <Actions
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {wired ? (
                <Button
                  size="small"
                  disabled={busy}
                  ariaLabel={false}
                  onClick={() => onUpdate(step)}
                >
                  Update
                </Button>
              ) : (
                <Button
                  size="small"
                  disabled={busy}
                  ariaLabel={false}
                  onClick={() => onCreate(step)}
                >
                  Create
                </Button>
              )}
            </Actions>
          </Row>
        );
      })}
    </List>
  );
});
