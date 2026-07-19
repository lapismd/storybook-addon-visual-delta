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

export const Toolbar = styled.div(({ theme }) => ({
  padding: "0.5rem 0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  backgroundColor: theme.background.content,
}));

export const GalleryContainer = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: 0,
  backgroundColor: "transparent",
  padding: 0,
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

export const ControlsRow = styled.div({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem 0.75rem",
});

export const InlineControl = styled.label(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.defaultText,
  minWidth: 0,
  flex: "1 1 140px",
  maxWidth: "220px",
}));

export const Slider = styled.input({
  flex: 1,
  minWidth: "64px",
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
});

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
  flexBasis: "100%",
});
