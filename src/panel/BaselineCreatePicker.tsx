import React from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { PlayStepInfo } from "./usePlaySteps.js";

const Picker = styled.div({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 6,
  width: "min(32rem, 100%)",
});

const ChoiceCopy = styled.span({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  minWidth: 0,
});

const ChoiceTitle = styled.span({
  fontWeight: 600,
});

const ChoiceHint = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 11,
  fontWeight: 400,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "28rem",
}));

function stepChoiceLabel(step: PlayStepInfo): string {
  return step.syntax?.text ?? step.label;
}

export function BaselineCreatePicker({
  steps,
  busy,
  onCreateDefault,
  onCreateInteraction,
}: {
  steps: PlayStepInfo[];
  busy: boolean;
  onCreateDefault: () => void;
  onCreateInteraction: (step: PlayStepInfo) => void;
}) {
  return (
    <Picker role="group" aria-label="Choose baseline to create">
      <Button
        size="small"
        ariaLabel="Create Default baseline"
        disabled={busy}
        onClick={onCreateDefault}
      >
        <ChoiceCopy>
          <ChoiceTitle>Default</ChoiceTitle>
          <ChoiceHint>End of play</ChoiceHint>
        </ChoiceCopy>
      </Button>
      {steps.map((step) => {
        const label = stepChoiceLabel(step);
        return (
          <Button
            key={step.stepId}
            size="small"
            ariaLabel={`Create ${label} baseline`}
            title={label}
            disabled={busy}
            onClick={() => onCreateInteraction(step)}
          >
            <ChoiceCopy>
              <ChoiceTitle>Interaction</ChoiceTitle>
              <ChoiceHint>{label}</ChoiceHint>
            </ChoiceCopy>
          </Button>
        );
      })}
    </Picker>
  );
}
