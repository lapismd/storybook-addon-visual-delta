import { IconButton } from "storybook/internal/components";
import { keyframes, styled, type Theme } from "storybook/theming";

/** Height reserved under panel content for the fixed status bar. */
export const PANEL_STATUS_BAR_HEIGHT = 28;

/**
 * Fallback sticky Visual Delta toolbar height. Live height is published as
 * `--vd-header-sticky-top` on the panel scroll root from `VisualDeltaHeader`.
 */
export const VISUAL_DELTA_HEADER_HEIGHT = 40;

/** CSS custom property for accordion sticky `top` (px length). */
export const VD_HEADER_STICKY_TOP_VAR = "--vd-header-sticky-top";

/**
 * Same fill as accordion `SectionBody` — Storybook/Tailwind canvas white in
 * light mode (not `theme.background.app` chrome grey).
 */
export function panelCanvasBackground(theme: Theme): string {
  return theme.base === "dark" ? theme.background.content : "#ffffff";
}

const spin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const DiffResultContainer = styled.div(({ theme }) => ({
  padding: "0.75rem 1rem 1rem",
  borderTop: `1px solid ${theme.appBorderColor}`,
  backgroundColor: panelCanvasBackground(theme),
}));

export const DiffStats = styled.div(({ theme }) => ({
  marginBottom: "0.75rem",
  fontSize: "12px",
  fontWeight: 500,
  color: theme.color.defaultText,
  textAlign: "center",
}));

export const DiffStatus = styled.span<{ passed: boolean }>(
  ({ passed, theme }) => ({
    fontWeight: 600,
    color: passed ? theme.color.positive : theme.color.negative,
  }),
);

/** Chromatic-style change summary above the compare stage. */
export const DiffSummary = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  marginBottom: "0.75rem",
  padding: "0.55rem 0.65rem",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: "4px",
  backgroundColor: theme.background.content,
}));

export const DiffSummaryRow = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
});

export const DiffSummaryMeta = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
  fontSize: "12px",
  fontWeight: 500,
  color: theme.color.defaultText,
  minWidth: 0,
}));

export const DiffSummaryDetail = styled.span(({ theme }) => ({
  color: theme.color.mediumdark,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
}));

export const HistogramPanel = styled.div(({ theme }) => ({
  padding: "0.5rem 0.35rem 0.25rem",
  borderRadius: "4px",
  backgroundColor: theme.background.hoverable ?? theme.color.lightest,
  border: `1px solid ${theme.appBorderColor}`,
}));

export const HistogramTitle = styled.div(({ theme }) => ({
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.positive,
  marginBottom: "0.35rem",
  paddingLeft: "0.25rem",
}));

export const HistogramChart = styled.div({
  display: "grid",
  gridTemplateColumns: "36px 1fr",
  gridTemplateRows: "140px auto",
  gap: "0.25rem 0.35rem",
  alignItems: "stretch",
});

export const HistogramYAxis = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "flex-end",
  fontSize: "10px",
  fontVariantNumeric: "tabular-nums",
  color: theme.color.mediumdark,
  paddingBottom: "2px",
}));

export const HistogramPlot = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "flex-end",
  gap: "2px",
  height: "140px",
  padding: "0 2px",
  borderLeft: `1px solid ${theme.appBorderColor}`,
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background:
    theme.background.hoverable ??
    `color-mix(in srgb, ${theme.color.secondary} 6%, ${theme.background.content})`,
}));

export const HistogramBar = styled.div(({ theme }) => ({
  flex: "1 1 0",
  minWidth: "2px",
  borderRadius: "2px 2px 0 0",
  backgroundColor: theme.color.secondary,
  transition: "height 120ms ease",
}));

export const HistogramXAxis = styled.div(({ theme }) => ({
  gridColumn: "2",
  display: "flex",
  justifyContent: "space-between",
  fontSize: "10px",
  fontVariantNumeric: "tabular-nums",
  color: theme.color.mediumdark,
  paddingTop: "2px",
}));

export const Toolbar = styled.div(({ theme }) => ({
  padding: "0.4rem 0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  backgroundColor: panelCanvasBackground(theme),
}));

export const ToolbarRow = styled.div({
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "center",
  gap: "0.5rem",
  minWidth: 0,
  overflowX: "auto",
  "&::-webkit-scrollbar": {
    height: "2px",
  },
});

export const GalleryContainer = styled.div({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "0.35rem",
  backgroundColor: "transparent",
  padding: 0,
  minWidth: 0,
  flex: "0 1 auto",
});

export const ImagesScrollContainer = styled.div({
  display: "flex",
  gap: "0.35rem",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "0",
  "&::-webkit-scrollbar": {
    height: "2px",
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    background: "#bbb",
    borderRadius: "2px",
  },
});

export const ImageWrapper = styled.div<{ selected: boolean }>(
  ({ selected, theme }) => ({
    position: "relative",
    flexShrink: 0,
    cursor: "pointer",
    width: "56px",
    height: "40px",
    border: selected
      ? `1px solid ${theme.color.secondary}`
      : `1px solid ${theme.appBorderColor}`,
    borderRadius: "3px",
    padding: "2px",
    backgroundColor: selected ? theme.background.hoverable : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      borderColor: theme.color.secondary,
    },
  }),
);

export const ThumbImage = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
});

export const EmptyState = styled.p({
  textAlign: "center",
  padding: "0",
  margin: 0,
});

export const EmptyStateContainer = styled.div({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  backgroundColor: "#ffffff",
  minHeight: "100%",
});

/** Centered empty-state CTA when no baseline images are configured. */
export const EmptyCreateWrap = styled.div({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1rem",
  flex: 1,
  minHeight: 220,
  padding: "2rem 1.5rem",
  textAlign: "center",
});

/** Panel placeholder while waiting for preview INIT_IMAGE. */
export const SkeletonRoot = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "0.75rem 1rem 1rem",
  minHeight: "100%",
  backgroundColor: panelCanvasBackground(theme),
  cursor: "progress",
}));

export const SkeletonToolbar = styled.div({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
});

export const SkeletonBone = styled.div<{
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}>(({ theme, width = "100%", height = 12, radius = 4 }) => ({
  display: "block",
  flex: "0 0 auto",
  width,
  height,
  borderRadius: radius,
  backgroundColor: theme.appBorderColor,
  ...theme.animation.inlineGlow,
}));

export const InlineControl = styled.label(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.defaultText,
  flex: "0 0 auto",
  whiteSpace: "nowrap",
}));

export const Slider = styled.input({
  width: "72px",
  flex: "0 0 auto",
  height: "3px",
  borderRadius: "2px",
  outline: "none",
  cursor: "pointer",
  "&::-webkit-slider-thumb": {
    appearance: "none",
    width: "11px",
    height: "11px",
    borderRadius: "50%",
    background: "#1ea7fd",
    cursor: "pointer",
  },
  "&::-moz-range-thumb": {
    width: "11px",
    height: "11px",
    borderRadius: "50%",
    background: "#1ea7fd",
    cursor: "pointer",
    border: "none",
  },
});

export const CheckboxContainer = styled.label(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  cursor: "pointer",
  userSelect: "none",
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.defaultText,
  whiteSpace: "nowrap",
}));

export const Checkbox = styled.input({
  width: "13px",
  height: "13px",
  cursor: "pointer",
  margin: 0,
});

export const ValueDisplay = styled.span(({ theme }) => ({
  fontSize: "11px",
  fontWeight: 500,
  color: theme.color.mediumdark,
  minWidth: "2.25rem",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
}));

export const Actions = styled.div({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  marginLeft: "auto",
  flex: "0 0 auto",
});

export const ToolbarSpacer = styled.div({
  flex: "1 1 auto",
  minWidth: "0.5rem",
});

/** Segmented control for compact toolbar actions (e.g. Reset). */
export const ButtonGroup = styled.div(({ theme }) => ({
  display: "inline-flex",
  flex: "0 0 auto",
  alignItems: "stretch",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: "4px",
  overflow: "hidden",
  "& > button": {
    border: "none",
    borderRadius: 0,
    margin: 0,
    boxShadow: "none",
  },
  "& > button + button": {
    borderLeft: `1px solid ${theme.appBorderColor}`,
  },
}));

export const GhostButton = styled.button(({ theme }) => ({
  padding: "4px 8px",
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.defaultText,
  backgroundColor: "transparent",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: "3px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": {
    borderColor: theme.color.secondary,
    color: theme.color.secondary,
  },
  "&:disabled": {
    opacity: 0.45,
    cursor: "not-allowed",
  },
}));

export const DiffButton = styled.button(({ theme }) => ({
  padding: "4px 10px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#fff",
  backgroundColor: theme.color.secondary,
  border: "none",
  borderRadius: "3px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: theme.color.positive,
  },
  "&:disabled": {
    backgroundColor: theme.color.mediumdark,
    cursor: "not-allowed",
  },
}));

export const ErrorText = styled.p({
  color: "#ee0000",
  fontSize: "11px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

/**
 * Panel frame. Status bar is position:fixed to the AddonPanel scrollport
 * (see PanelStatusBar) so Storybook's outer panel scroller cannot move it.
 */
export const PanelShell = styled.div(({ theme }) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: "100%",
  boxSizing: "border-box",
  background: panelCanvasBackground(theme),
}));

/** Main panel body (Storybook may also scroll the AddonPanel wrapper). */
export const PanelScroll = styled.div(({ theme }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  // Clearance for the fixed half-width status bar over the bottom-right.
  paddingBottom: PANEL_STATUS_BAR_HEIGHT,
  background: panelCanvasBackground(theme),
}));

/** Content below the sticky Visual Delta header. */
export const PanelBody = styled.div(({ theme }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  background: panelCanvasBackground(theme),
  boxSizing: "border-box",
}));

export const StatusBar = styled.div(({ theme }) => ({
  // Position/size are set inline from the AddonPanel scrollport rect.
  position: "fixed",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: PANEL_STATUS_BAR_HEIGHT,
  minWidth: 0,
  padding: "0 8px",
  boxSizing: "border-box",
  borderTop: `1px solid ${theme.appBorderColor}`,
  borderLeft: `1px solid ${theme.appBorderColor}`,
  borderTopLeftRadius: Math.max(theme.appBorderRadius ?? 4, 6),
  backgroundColor: theme.background.app ?? theme.background.content,
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1 - 1,
  pointerEvents: "auto",
}));

export const StatusProgressButton = styled.button<{
  $hasError?: boolean;
  $idle?: boolean;
}>(({ theme, $hasError, $idle }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flex: "1 1 auto",
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
  height: 22,
  margin: 0,
  padding: "0 6px",
  border: "none",
  borderRadius: theme.appBorderRadius ?? 4,
  background: "transparent",
  color: $hasError
    ? theme.color.negative
    : $idle
      ? theme.textMutedColor
      : theme.color.defaultText,
  fontSize: "inherit",
  fontFamily: "inherit",
  lineHeight: 1.2,
  cursor: $idle ? "default" : "pointer",
  textAlign: "left",
  "&:hover:not(:disabled)": {
    backgroundColor: theme.background.hoverable ?? theme.color.lightest,
  },
  "&:disabled": {
    cursor: "default",
    opacity: 1,
  },
  "&:focus-visible": {
    outline: `2px solid ${theme.color.secondary}`,
    outlineOffset: 1,
  },
}));

export const StatusSpinner = styled.span({
  display: "inline-flex",
  flex: "0 0 auto",
  width: 12,
  height: 12,
  lineHeight: 0,
  animation: `${spin} 0.9s linear infinite`,
  "& svg": {
    width: 12,
    height: 12,
    display: "block",
  },
});

export const StatusProgressLabel = styled.span({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** Terminal-style shell for the progress log popover. */
export const StatusLogShell = styled.div<{ $hasError?: boolean }>(
  ({ $hasError }) => ({
    position: "relative",
    boxSizing: "border-box",
    width: "min(560px, 80vw)",
    height: 240,
    border: `1px solid ${$hasError ? "#7f1d1d" : "#2a2f3a"}`,
    borderRadius: 4,
    backgroundColor: "#0f1115",
    boxShadow: $hasError ? "inset 0 0 0 1px rgba(248, 113, 113, 0.25)" : "none",
    overflow: "hidden",
  }),
);

export const StatusLogCopyButton = styled(IconButton)({
  position: "absolute",
  top: 6,
  // Clear of Storybook ScrollArea’s ~10px vertical thumb + padding.
  right: 18,
  zIndex: 2,
  color: "#c8cdd5 !important",
  background: "rgba(15, 17, 21, 0.85) !important",
  "&:hover": {
    color: "#f1f3f5 !important",
    background: "rgba(42, 47, 58, 0.95) !important",
  },
  "& svg": {
    width: 14,
    height: 14,
  },
});

/** Non-scrolling log text; parent Storybook ScrollArea owns overflow. */
export const StatusLogBody = styled.pre(({ theme }) => ({
  margin: 0,
  // Right padding clears the absolute copy control + ScrollArea thumb.
  padding: "8px 44px 24px 10px",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 11,
  lineHeight: 1.45,
  fontFamily: theme.typography.fonts.mono,
  color: "#c8cdd5",
  background: "transparent",
}));
