import React, { useEffect, useState } from "react";
import { styled } from "storybook/theming";
import { Slider } from "./styled.js";

const Root = styled.span({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "auto",
  flex: "1 1 auto",
  minWidth: 0,
});

const NumberField = styled.input(({ theme }) => ({
  width: "4.5rem",
  minWidth: 0,
  flex: "0 0 auto",
  boxSizing: "border-box",
  padding: "5px 7px",
  border: `1px solid ${theme.input.border}`,
  borderRadius: theme.input.borderRadius,
  background: theme.input.background,
  color: theme.input.color,
  font: "inherit",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
}));

const Suffix = styled.span(({ theme }) => ({
  marginLeft: -4,
  color: theme.textMutedColor,
  fontSize: 11,
}));

export type RangeNumberInputProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
  suffix?: string;
  inputWidth?: string;
};

export function RangeNumberInput({
  value,
  min,
  max,
  step,
  label,
  onChange,
  suffix,
  inputWidth,
}: RangeNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const revert = () => setDraft(String(value));
  const commit = () => {
    setEditing(false);
    const next = Number(draft);
    if (
      draft.trim() === "" ||
      !Number.isFinite(next) ||
      next < min ||
      next > max
    ) {
      revert();
      return;
    }
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <Root>
      <Slider
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <NumberField
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        style={inputWidth ? { width: inputWidth } : undefined}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            revert();
          }
        }}
      />
      {suffix ? <Suffix aria-hidden>{suffix}</Suffix> : null}
    </Root>
  );
}
