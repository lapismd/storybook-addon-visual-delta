import { styled } from "storybook/theming";

export const DiffResultContainer = styled.div(({ theme }) => ({
  padding: "0.75rem 1rem 1rem",
  borderTop: `1px solid ${theme.appBorderColor}`,
  backgroundColor: theme.background.content,
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

export const DiffToolLabel = styled.span({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
});

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
  backgroundColor: theme.background.content,
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
  padding: "2rem",
});

export const EmptyStateContainer = styled.div({
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  backgroundColor: "#ffffff",
  minHeight: "100%",
});

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
