import React from "react";
import { ToggleButton } from "storybook/internal/components";
import {
  COMPARE_ZOOM_MAX,
  COMPARE_ZOOM_MIN,
  compareZoomPercent,
  stepCompareZoom,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import { ButtonGroup } from "./styled.js";

export function CompareZoomControl({
  value,
  onChange,
  label = "Split zoom",
}: {
  value: CompareZoomState;
  onChange: (value: CompareZoomState) => void;
  label?: string;
}) {
  const percent = compareZoomPercent(value.scale);
  const nudge = (direction: -1 | 1) =>
    onChange({
      mode: "custom",
      scale: stepCompareZoom(value.scale, direction),
    });

  return (
    <ButtonGroup role="group" aria-label={label}>
      <ToggleButton
        size="small"
        pressed={value.mode === "fit"}
        onClick={() => onChange({ mode: "fit", scale: value.scale })}
        ariaLabel={`Fit split comparison. Current ${percent}%`}
        title="Fit both comparison panes"
      >
        Fit
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={false}
        disabled={value.scale <= COMPARE_ZOOM_MIN}
        onClick={() => nudge(-1)}
        ariaLabel="Zoom out split comparison"
      >
        −
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={false}
        disabled
        ariaLabel={`Split zoom ${percent}%`}
        style={{ minWidth: "3.25rem", fontVariantNumeric: "tabular-nums" }}
      >
        {percent}%
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={false}
        disabled={value.scale >= COMPARE_ZOOM_MAX}
        onClick={() => nudge(1)}
        ariaLabel="Zoom in split comparison"
      >
        +
      </ToggleButton>
      <ToggleButton
        size="small"
        pressed={value.mode === "custom" && value.scale === 1}
        onClick={() => onChange({ mode: "custom", scale: 1 })}
        ariaLabel="Show split comparison at 100%"
        title="Native CSS size (100%)"
      >
        100%
      </ToggleButton>
    </ButtonGroup>
  );
}
