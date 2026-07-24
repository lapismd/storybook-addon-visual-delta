import React from "react";
import { Form } from "storybook/internal/components";
import { styled } from "storybook/theming";

const Wrap = styled.div({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  fontSize: 11,
});

const Label = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  flexShrink: 0,
  fontWeight: 600,
}));

export function ModeSelector({
  modeNames,
  value,
  onChange,
  disabled = false,
}: {
  modeNames: string[];
  value: string | null;
  onChange: (mode: string | null) => void;
  disabled?: boolean;
}) {
  if (modeNames.length === 0) return null;
  return (
    <Wrap>
      <Label id="visual-delta-mode-label">Mode</Label>
      <Form.Select
        aria-labelledby="visual-delta-mode-label"
        disabled={disabled}
        value={value ?? ""}
        size="100%"
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const next = e.currentTarget.value;
          onChange(next === "" ? null : next);
        }}
      >
        <option value="">Default</option>
        {modeNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Form.Select>
    </Wrap>
  );
}
