import React, { useMemo } from "react";
import { DIFF_HISTOGRAM_BINS } from "./diff-assets.js";
import {
  HistogramBar,
  HistogramChart,
  HistogramPanel,
  HistogramPlot,
  HistogramTitle,
  HistogramXAxis,
  HistogramYAxis,
} from "./styled.js";

function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function DiffHistogram({ bins }: { bins: number[] }) {
  const { max, yTicks, xLabels } = useMemo(() => {
    const values = bins.length > 0 ? bins : new Array(DIFF_HISTOGRAM_BINS).fill(0);
    const peak = Math.max(1, ...values);
    const top = Math.ceil(peak / 4) * 4 || 4;
    return {
      max: top,
      yTicks: [top, Math.round(top * 0.5), 0].map(formatCount),
      xLabels: ["0", "64", "128", "192", "255"],
    };
  }, [bins]);

  const values =
    bins.length > 0 ? bins : new Array(DIFF_HISTOGRAM_BINS).fill(0);

  return (
    <HistogramPanel>
      <HistogramTitle>Difference distribution</HistogramTitle>
      <HistogramChart
        role="img"
        aria-label="Histogram of changed-pixel difference magnitudes"
      >
        <HistogramYAxis aria-hidden>
          {yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </HistogramYAxis>
        <HistogramPlot>
          {values.map((count, i) => (
            <HistogramBar
              key={i}
              title={`${count} pixels · delta bin ${i + 1}/${values.length}`}
              style={{
                height: `${Math.max(count > 0 ? 2 : 0, (count / max) * 100)}%`,
              }}
            />
          ))}
        </HistogramPlot>
        <HistogramXAxis aria-hidden>
          {xLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </HistogramXAxis>
      </HistogramChart>
    </HistogramPanel>
  );
}
