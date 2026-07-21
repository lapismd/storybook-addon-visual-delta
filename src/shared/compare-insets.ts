/**
 * Pure box-model helpers for split/center compare alignment.
 * Keep these free of DOM so unit tests can lock alignment regressions.
 */

export type BoxSidesPx = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Subset of CSSStyleDeclaration fields we read for insets. */
export type CssBoxLike = {
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderTopWidth?: string;
  borderRightWidth?: string;
  borderBottomWidth?: string;
  borderLeftWidth?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
};

function px(value: string | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Baseline pane padding = canvas padding + subject margin (per side).
 * Component-clipped baselines have no chrome; without subject margins
 * (e.g. Tailwind `my-2`) the PNG sits too high/left vs the live control.
 */
export function baselinePanePaddingPx(
  canvasStyle: CssBoxLike,
  subjectStyle?: CssBoxLike | null,
): BoxSidesPx {
  return {
    top: px(canvasStyle.paddingTop) + px(subjectStyle?.marginTop),
    right: px(canvasStyle.paddingRight) + px(subjectStyle?.marginRight),
    bottom: px(canvasStyle.paddingBottom) + px(subjectStyle?.marginBottom),
    left: px(canvasStyle.paddingLeft) + px(subjectStyle?.marginLeft),
  };
}

/**
 * Total chrome on each axis for equal-pane min size: canvas padding + border
 * + subject margins.
 */
export function canvasCompareInsetsPx(
  canvasStyle: CssBoxLike,
  subjectStyle?: CssBoxLike | null,
): { x: number; y: number } {
  const padBorderX =
    px(canvasStyle.paddingLeft) +
    px(canvasStyle.paddingRight) +
    px(canvasStyle.borderLeftWidth) +
    px(canvasStyle.borderRightWidth);
  const padBorderY =
    px(canvasStyle.paddingTop) +
    px(canvasStyle.paddingBottom) +
    px(canvasStyle.borderTopWidth) +
    px(canvasStyle.borderBottomWidth);
  const marginX =
    px(subjectStyle?.marginLeft) + px(subjectStyle?.marginRight);
  const marginY =
    px(subjectStyle?.marginTop) + px(subjectStyle?.marginBottom);
  return {
    x: padBorderX + marginX,
    y: padBorderY + marginY,
  };
}

/** Offset of the subject border-box from the canvas padding edge. */
export function subjectOffsetInCanvasPx(
  subjectStyle?: CssBoxLike | null,
): { x: number; y: number } {
  return {
    x: px(subjectStyle?.marginLeft),
    y: px(subjectStyle?.marginTop),
  };
}
