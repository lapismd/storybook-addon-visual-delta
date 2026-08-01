import React, { memo, useMemo, useState } from "react";
import {
  AddIcon,
  CheckIcon,
  ChevronSmallDownIcon,
  CommitIcon,
  CrossIcon,
  EllipsisIcon,
  GraphBarIcon,
  SyncIcon,
  TrashIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
  ToggleButton,
} from "storybook/internal/components";
import { styled, type Theme } from "storybook/theming";
import type { VisualDeltaInteraction } from "../constants.js";
import type { InteractionCallTokenKind, PlayStepInfo } from "./usePlaySteps.js";
import {
  panelCanvasBackground,
  VD_PANEL_SCROLL_TAIL_VAR,
} from "./styled.js";

export const BASELINE_ACCORDION_BODY_MIN_HEIGHT = 400;

const List = styled.div({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  marginBottom: "0.5rem",
});

const InteractionFilter = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minHeight: 32,
  padding: "4px 12px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: panelCanvasBackground(theme),
}));

/** Per-section wrapper so sticky summaries are constrained to their body. */
const Section = styled.div<{ $expanded?: boolean }>(({ $expanded }) => ({
  display: "flex",
  flexDirection: "column",
  // Expanded sections consume spare height but never shrink below the body's
  // 400px inspection contract. Collapsed rows stay content-sized.
  ...($expanded ? { flex: "1 0 auto", minHeight: 0 } : null),
}));

const SummaryRow = styled.div<{ $expanded?: boolean }>(
  ({ theme, $expanded }) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minHeight: 32,
    textAlign: "left",
    border: "none",
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $expanded
      ? theme.background.hoverable
      : panelCanvasBackground(theme),
    color: theme.color.defaultText,
    padding: "4px 12px 4px 0",
    // Only the expanded summary pins. Stacking every collapsed row at the
    // same top coordinate makes adjacent action buttons overlap after the
    // selected interaction is scrolled into view.
    position: $expanded ? "sticky" : "relative",
    // The list is the bounded scroll owner and already begins below the fixed
    // Visual Delta header, so pin the active row to its own top edge.
    top: $expanded ? 0 : "auto",
    zIndex: $expanded ? 1 : "auto",
    "&:hover": {
      background: theme.background.hoverable,
    },
  }),
);

const SummaryButton = styled.button({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  minHeight: 24,
  flex: 1,
  alignSelf: "stretch",
  border: "none",
  background: "transparent",
  color: "inherit",
  padding: "0 0 0 12px",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
  "& *": {
    cursor: "inherit",
  },
});

const Chevron = styled.span<{ $expanded?: boolean }>(
  ({ theme, $expanded }) => ({
    display: "inline-flex",
    flexShrink: 0,
    width: 12,
    color: theme.textMutedColor,
    transform: $expanded ? "rotate(0deg)" : "rotate(-90deg)",
    transition: "transform 120ms ease",
    "& svg": { width: 12, height: 12 },
  }),
);

const StatusSlot = styled.span({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 14,
  height: 14,
});

const StatusIcon = styled.span<{ $passed: boolean }>(({ theme, $passed }) => ({
  display: "inline-flex",
  color: $passed ? theme.color.positive : theme.color.negative,
  "& svg": { width: 14, height: 14 },
}));

const Meta = styled.div<{ $labelWidth: string }>(({ $labelWidth }) => ({
  display: "grid",
  gridTemplateColumns: `${$labelWidth} minmax(0, 1fr)`,
  alignItems: "center",
  columnGap: 12,
  minWidth: 0,
  flex: 1,
}));

const Label = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const SyntaxContent = styled.span(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontWeight: theme.typography.weight.regular,
}));

const syntaxColor = (theme: Theme, kind: InteractionCallTokenKind) => {
  const dark = theme.base === "dark";
  switch (kind) {
    case "method":
      return dark ? "#5EC1FF" : "#0271B6";
    case "string":
      return dark ? "#5FE584" : "#16B242";
    case "number":
      return dark ? "#6ba5ff" : "#5D40D0";
    case "boolean":
      return dark ? "#ff4191" : "#f41840";
    case "nullish":
      return dark ? "#aaa" : "#7D99AA";
    case "tag":
      return dark ? "#f57bff" : "#6F2CAC";
    case "tag-suffix":
      return dark ? "#8EB5FF" : "#1F99E5";
    case "meta":
      return dark ? "#FAD483" : "#EA7509";
    default:
      return dark ? "#eee" : "#444";
  }
};

const SyntaxToken = styled.span<{ $kind: InteractionCallTokenKind }>(
  ({ theme, $kind }) => ({
    color: syntaxColor(theme, $kind),
  }),
);

const Hint = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.textMutedColor,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const SummaryRight = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
  marginLeft: "auto",
});

const Stats = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.textMutedColor,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
}));

const SummaryActions = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
});

const SectionBody = styled.div(({ theme }) => ({
  flex: `1 0 ${BASELINE_ACCORDION_BODY_MIN_HEIGHT}px`,
  minHeight: BASELINE_ACCORDION_BODY_MIN_HEIGHT,
  overflow: "auto",
  padding: "12px 16px 16px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: panelCanvasBackground(theme),
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
}));

const ScrollTail = styled.div({
  flex: `0 0 var(${VD_PANEL_SCROLL_TAIL_VAR}, 0px)`,
  minHeight: `var(${VD_PANEL_SCROLL_TAIL_VAR}, 0px)`,
  pointerEvents: "none",
});

export type BaselineSectionId = "default" | string;

export type BaselineSectionStatus = "pass" | "fail";

export type BaselineSectionHistory = {
  path: string;
  label: string;
  componentPath?: string;
};

export type BaselineSection = {
  id: BaselineSectionId;
  label: string;
  hint: string;
  thumbSrc?: string;
  step?: PlayStepInfo;
  wired?: VisualDeltaInteraction;
  /** Live compare outcome for the currently loaded baseline, if any. */
  status?: BaselineSectionStatus | null;
  /** Compact pass/fail stats shown on the right of the accordion header. */
  stats?: string | null;
  /** Development-only VCS history target for this concrete baseline. */
  history?: BaselineSectionHistory;
};

/** Baseline preview shown in the expanded section toolbar. */
export const SectionThumbFrame = styled.button(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 88,
  height: 56,
  flexShrink: 0,
  borderRadius: 4,
  border: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  overflow: "hidden",
  padding: 0,
  cursor: "zoom-in",
  "&:focus-visible": {
    outline: `2px solid ${theme.color.secondary}`,
    outlineOffset: 2,
  },
}));

export const SectionThumb = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
});

export const BaselineAccordion = memo(function BaselineAccordion({
  sections,
  expandedId,
  busy,
  showDistribution,
  showAllInteractions = false,
  hiddenInteractionCount = 0,
  showInteractionFilter = false,
  onExpand,
  onCreateDefault,
  onCreate,
  onUpdate,
  onUpdateDefault,
  onDelete,
  onToggleDistribution,
  onToggleInteractions,
  onOpenHistory,
  renderBody,
  allowMutations = true,
}: {
  sections: BaselineSection[];
  expandedId: BaselineSectionId | null;
  busy: boolean;
  showDistribution: boolean;
  /** Whether capture points without a baseline are visible. */
  showAllInteractions?: boolean;
  /** Number of interaction capture points hidden by the default filter. */
  hiddenInteractionCount?: number;
  /** Keep the filter available before Storybook has replayed its call log. */
  showInteractionFilter?: boolean;
  onExpand: (id: BaselineSectionId) => void;
  /** Create the primary end-of-play baseline when the Default row is empty. */
  onCreateDefault?: () => void;
  onCreate: (step: PlayStepInfo) => void;
  onUpdate: (step: PlayStepInfo) => void;
  /** Rewrite the story's primary (Default) baseline. */
  onUpdateDefault: () => void;
  /** Remove this exact screenshot from CSF and local storage. */
  onDelete: (section: BaselineSection) => void;
  onToggleDistribution: () => void;
  onToggleInteractions?: () => void;
  onOpenHistory?: (target: BaselineSectionHistory) => void;
  renderBody: (section: BaselineSection) => React.ReactNode;
  /** When false, hide create/update/delete (static read-only). */
  allowMutations?: boolean;
}) {
  const [openMenuId, setOpenMenuId] = useState<BaselineSectionId | null>(null);
  const labelWidth = useMemo(() => {
    const longest = sections.reduce(
      (max, section) =>
        Math.max(max, (section.step?.syntax?.text ?? section.label).length),
      0,
    );
    // Preserve room for the baseline hint even when a resolved expectation is
    // substantially longer than the original method-only label.
    return `min(${Math.min(Math.max(longest + 1, 8), 60)}ch, 65%)`;
  }, [sections]);

  return (
    <List role="region" aria-label="Visual baselines and interactions">
      {(showInteractionFilter || hiddenInteractionCount > 0) &&
      onToggleInteractions ? (
        <InteractionFilter>
          <ToggleButton
            size="small"
            padding="small"
            pressed={showAllInteractions}
            onClick={onToggleInteractions}
            ariaLabel={
              showAllInteractions
                ? "Hide interactions without baselines"
                : "Show all interactions"
            }
            title={
              showAllInteractions
                ? "Show only interactions with baselines"
                : hiddenInteractionCount > 0
                  ? `Show ${hiddenInteractionCount} interaction${
                      hiddenInteractionCount === 1 ? "" : "s"
                    } without baselines`
                  : "Discover and show interactions without baselines"
            }
          >
            {showAllInteractions
              ? "Baselines only"
              : hiddenInteractionCount > 0
                ? `Show all (${hiddenInteractionCount} more)`
                : "Show all interactions"}
          </ToggleButton>
        </InteractionFilter>
      ) : null}
      {sections.map((section) => {
        const expanded = expandedId === section.id;
        const hasDiff = Boolean(section.status && section.stats);
        const hasBaseline = Boolean(section.thumbSrc || section.wired?.src);
        const createLabel =
          section.step?.syntax?.text ?? section.step?.label ?? section.label;
        const createActionLabel = section.step
          ? `Create ${createLabel} baseline (${section.step.stepId})`
          : `Create ${createLabel} baseline`;
        const canCreateDefault =
          allowMutations &&
          !hasBaseline &&
          section.id === "default" &&
          Boolean(onCreateDefault);
        const canCreateInteraction =
          allowMutations && !hasBaseline && Boolean(section.step);
        const canCreate = canCreateDefault || canCreateInteraction;
        const canMutateBaseline = allowMutations && hasBaseline;
        const hasMenu =
          (allowMutations &&
            (hasBaseline ||
              section.id === "default" ||
              Boolean(section.step) ||
              Boolean(section.wired))) ||
          Boolean(section.history && onOpenHistory);
        return (
          <Section key={section.id} $expanded={expanded}>
            {/*
              Avoid Storybook Collapsible’s opacity/translate transition —
              swapping sections animated both collapse + expand and felt like
              the whole Visual Delta panel flickering.
            */}
            <SummaryRow $expanded={expanded}>
              <SummaryButton
                type="button"
                aria-expanded={expanded}
                onClick={() => onExpand(section.id)}
              >
                <Chevron $expanded={expanded} aria-hidden>
                  <ChevronSmallDownIcon />
                </Chevron>
                <StatusSlot>
                  {section.status ? (
                    <StatusIcon
                      $passed={section.status === "pass"}
                      aria-label={
                        section.status === "pass" ? "Passed" : "Failed"
                      }
                    >
                      {section.status === "pass" ? (
                        <CheckIcon />
                      ) : (
                        <CrossIcon />
                      )}
                    </StatusIcon>
                  ) : null}
                </StatusSlot>
                <Meta $labelWidth={labelWidth}>
                  <Label title={section.step?.syntax?.text ?? section.label}>
                    {section.step?.syntax ? (
                      <SyntaxContent>
                        {section.step.syntax.tokens.map((token, index) => (
                          <SyntaxToken
                            // Repeated punctuation is expected in call syntax.
                            key={`${token.kind}-${index}`}
                            $kind={token.kind}
                          >
                            {token.text}
                          </SyntaxToken>
                        ))}
                      </SyntaxContent>
                    ) : (
                      section.label
                    )}
                  </Label>
                  {" "}
                  <Hint title={section.hint}>{section.hint}</Hint>
                </Meta>
                <SummaryRight>
                  {section.stats ? <Stats>{section.stats}</Stats> : null}
                </SummaryRight>
              </SummaryButton>
              <SummaryActions>
                {expanded && hasDiff ? (
                  <ToggleButton
                    size="small"
                    padding="small"
                    pressed={showDistribution}
                    onClick={onToggleDistribution}
                    ariaLabel="Difference distribution"
                    title="Difference distribution"
                    aria-expanded={showDistribution}
                  >
                    <GraphBarIcon />
                  </ToggleButton>
                ) : null}
                {canCreate ? (
                  <Button
                    size="small"
                    variant="ghost"
                    padding="small"
                    disabled={busy}
                    ariaLabel={createActionLabel}
                    title={createActionLabel}
                    onClick={() => {
                      if (canCreateDefault) {
                        onCreateDefault?.();
                        return;
                      }
                      if (section.step) onCreate(section.step);
                    }}
                  >
                    <AddIcon />
                  </Button>
                ) : null}
                {hasMenu ? (
                  <PopoverProvider
                    ariaLabel={`More ${section.label} baseline actions`}
                    placement="bottom-end"
                    padding={0}
                    visible={openMenuId === section.id}
                    onVisibleChange={(open) =>
                      setOpenMenuId(open ? section.id : null)
                    }
                    popover={() => (
                      <div style={{ minWidth: 190 }}>
                        <ActionList>
                          {section.history && onOpenHistory ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Open ${section.history.label} baseline history`}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenHistory(section.history!);
                                }}
                              >
                                <ActionList.Icon>
                                  <CommitIcon />
                                </ActionList.Icon>
                                <ActionList.Text>History</ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {canCreate ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={createActionLabel}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  if (canCreateDefault) {
                                    onCreateDefault?.();
                                    return;
                                  }
                                  if (section.step) onCreate(section.step);
                                }}
                              >
                                <ActionList.Icon>
                                  <AddIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Create baseline
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {canMutateBaseline &&
                          (section.id === "default" || section.wired) ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Update ${section.label} baseline`}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  if (section.id === "default") {
                                    onUpdateDefault();
                                    return;
                                  }
                                  if (section.step) onUpdate(section.step);
                                }}
                              >
                                <ActionList.Icon>
                                  <SyncIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Update baseline
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {canMutateBaseline ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Delete ${section.label} screenshot`}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onDelete(section);
                                }}
                              >
                                <ActionList.Icon>
                                  <TrashIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Delete screenshot
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                        </ActionList>
                      </div>
                    )}
                  >
                    <Button
                      size="small"
                      variant="ghost"
                      padding="small"
                      ariaLabel={`More ${section.label} baseline actions`}
                      title={`More ${section.label} baseline actions`}
                    >
                      <EllipsisIcon />
                    </Button>
                  </PopoverProvider>
                ) : null}
              </SummaryActions>
            </SummaryRow>
            {expanded ? (
              <SectionBody data-visual-delta-accordion-body={section.id}>
                {renderBody(section)}
              </SectionBody>
            ) : null}
          </Section>
        );
      })}
      <ScrollTail data-visual-delta-scroll-tail aria-hidden="true" />
    </List>
  );
});
