import React, { useEffect, useState } from "react";
import { CollapseIcon, ZoomResetIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  COMPARE_ZOOM_MAX,
  COMPARE_ZOOM_MIN,
  compareZoomPercent,
  stepCompareZoom,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import { ButtonGroup } from "./styled.js";

const PercentInput = styled.input(({ theme }) => ({
  width: "3.25rem",
  height: 28,
  minWidth: 0,
  boxSizing: "border-box",
  padding: "0 4px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 0,
  background: theme.input.background,
  color: theme.input.color,
  font: "inherit",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  "&:focus": {
    position: "relative",
    zIndex: 1,
    outline: `1px solid ${theme.color.secondary}`,
    outlineOffset: -1,
  },
}));

export function CompareZoomControl({
  value,
  onChange,
  label = "Split zoom",
  subject = "split comparison",
}: {
  value: CompareZoomState;
  onChange: (value: CompareZoomState) => void;
  label?: string;
  subject?: string;
}) {
  const percent = compareZoomPercent(value.scale);
  const [draft, setDraft] = useState(String(percent));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(percent));
  }, [editing, percent]);

  const nudge = (direction: -1 | 1) =>
    onChange({
      mode: "custom",
      scale: stepCompareZoom(value.scale, direction),
    });
  const commit = () => {
    setEditing(false);
    const next = Number(draft);
    if (
      draft.trim() === "" ||
      !Number.isInteger(next) ||
      next < COMPARE_ZOOM_MIN * 100 ||
      next > COMPARE_ZOOM_MAX * 100
    ) {
      setDraft(String(percent));
      return;
    }
    setDraft(String(next));
    onChange({ mode: "custom", scale: next / 100 });
  };

  return (
    <ButtonGroup role="group" aria-label={label}>
      <ToggleButton
        size="small"
        pressed={value.mode === "fit"}
        onClick={() => onChange({ mode: "fit", scale: value.scale })}
        ariaLabel={`Fit ${subject}. Current ${percent}%`}
        tooltip={`Fit ${subject}`}
      >
        <CollapseIcon />
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={false}
        disabled={value.scale <= COMPARE_ZOOM_MIN}
        onClick={() => nudge(-1)}
        ariaLabel={`Zoom out ${subject}`}
      >
        −
      </ToggleButton>
      <PercentInput
        type="number"
        min={COMPARE_ZOOM_MIN * 100}
        max={COMPARE_ZOOM_MAX * 100}
        step={1}
        value={draft}
        aria-label={`${label} percentage`}
        title={`${label}: ${percent}%`}
        onFocus={(event) => {
          setEditing(true);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            setDraft(String(percent));
          }
        }}
      />
      <ToggleButton
        size="small"
        pressed={false}
        disabled={value.scale >= COMPARE_ZOOM_MAX}
        onClick={() => nudge(1)}
        ariaLabel={`Zoom in ${subject}`}
      >
        +
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={value.mode === "custom" && value.scale === 1}
        onClick={() => onChange({ mode: "custom", scale: 1 })}
        ariaLabel={`Show ${subject} at 100%`}
        tooltip={`Show ${subject} at native CSS size (100%)`}
      >
        <ZoomResetIcon />
      </ToggleButton>
    </ButtonGroup>
  );
}
