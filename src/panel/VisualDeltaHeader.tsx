import React, { memo, useLayoutEffect, useRef } from "react";
import {
  CloseIcon,
  EllipsisIcon,
  ExpandIcon,
  EyeCloseIcon,
  EyeIcon,
  SyncIcon,
  UndoIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  IconButton,
  PopoverProvider,
  Separator,
  Toolbar,
  TooltipNote,
  WithTooltip,
} from "storybook/internal/components";
import { styled, useTheme } from "storybook/theming";
import type { VisualReviewStatus } from "../constants.js";
import {
  AcceptSplitButton,
  type AcceptScope,
} from "../manager/AcceptSplitButton.js";
import {
  DiffCaptureSplitButton,
  type DiffCaptureEngine,
} from "../manager/DiffCaptureSplitButton.js";
import { useReviewLayoutToggle } from "../manager/ReviewLayoutTool.js";
import {
  VisualRunSplitButton,
  type VisualRunMode,
} from "../manager/VisualRunSplitButton.js";
import { ReviewStatusPad } from "./ReviewStatusPad.js";
import { VISUAL_DELTA_HEADER_HEIGHT } from "./styled.js";
import {
  BadgeActionButton,
  VisualStatusBadge,
  type VisualBadgeStatus,
} from "./VisualStatusBadge.js";

const HeaderWrap = styled.div(({ theme }) => ({
  boxShadow: `${theme.appBorderColor} 0 -1px 0 0 inset`,
  background: theme.background.app,
  position: "sticky",
  top: 0,
  zIndex: 2,
  minHeight: VISUAL_DELTA_HEADER_HEIGHT,
  boxSizing: "border-box",
}));

const ControlsGroup = styled.div({
  display: "flex",
  alignItems: "center",
  flex: 1,
  gap: 6,
  minWidth: 0,
});

const RightGroup = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  marginLeft: "auto",
});

export const VisualDeltaHeader = memo(function VisualDeltaHeader({
  badgeStatus,
  empty,
  busy,
  storyMissing,
  isDiffing,
  isRunning,
  diffProgressLabel,
  runProgressLabel,
  createLabel,
  reviewStatus,
  skipVisual,
  onDiff,
  onRun,
  onReRunDiff,
  onCreate,
  onUpdateBaselines,
  onResetSettings,
  onStopDiff,
  onStopRun,
  onReviewStatus,
  onAccept,
  onUnaccept,
  onToggleSkipVisual,
  onOpenConfiguration,
  isUpdating,
  onHeightChange,
}: {
  badgeStatus: VisualBadgeStatus | null;
  empty: boolean;
  busy: boolean;
  storyMissing: boolean;
  isDiffing: boolean;
  isRunning: boolean;
  diffProgressLabel: string | null;
  runProgressLabel: string | null;
  createLabel: string;
  reviewStatus: VisualReviewStatus | null;
  /** Story CSF currently has `skip-visual`. */
  skipVisual: boolean;
  onDiff: (engine: DiffCaptureEngine) => void;
  onRun: (mode: VisualRunMode) => void;
  /** Re-run Diff with the last selected capture engine (HTML or Chromium). */
  onReRunDiff?: () => void;
  onCreate: () => void;
  onUpdateBaselines: () => void;
  onResetSettings: () => void;
  onStopDiff: () => void;
  onStopRun: () => void;
  onReviewStatus: (status: VisualReviewStatus) => void;
  onAccept: (scope: AcceptScope) => void;
  onUnaccept: (scope: AcceptScope) => void;
  onToggleSkipVisual: () => void;
  onOpenConfiguration: () => void;
  isUpdating: boolean;
  /** Reports sticky Pass/Diff toolbar height for accordion offset. */
  onHeightChange?: (height: number) => void;
}) {
  const theme = useTheme();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const pendingReviewToggle = useRef(false);
  const { active: reviewLayoutActive, toggle: toggleReviewLayout } =
    useReviewLayoutToggle();
  const reviewLayoutLabel = reviewLayoutActive
    ? "Exit review layout"
    : "Review layout";

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || !onHeightChange) return;
    const publish = () => {
      const next = Math.round(el.getBoundingClientRect().height);
      if (next > 0) onHeightChange(next);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const skipActionLabel = skipVisual
    ? "Include in visual tests"
    : "Skip visual tests";
  const skipActionNote = skipVisual
    ? "Remove skip-visual so Playwright and Visual Delta run this story"
    : "Add skip-visual to exclude this story from Playwright visual runs";

  return (
    <HeaderWrap ref={headerRef} data-vd-header="controls">
      <Toolbar
        backgroundColor={theme.background.app}
        innerStyle={{ gap: 6, paddingInline: 15 }}
        aria-label="Visual Delta controls"
      >
        <ControlsGroup>
          <DiffCaptureSplitButton
            compact
            isRunning={isDiffing}
            progressLabel={diffProgressLabel}
            disabled={busy && !isDiffing}
            storyMissing={storyMissing}
            onDiff={onDiff}
            onStop={onStopDiff}
          />
          <VisualRunSplitButton
            panel
            compact
            isRunning={isRunning}
            progressLabel={runProgressLabel}
            disabled={busy && !isRunning}
            storyMissing={storyMissing}
            allowStory
            onRun={onRun}
            onStop={onStopRun}
          />
          {badgeStatus ? (
            <>
              <Separator />
              <VisualStatusBadge status={badgeStatus} />
              <WithTooltip
                hasChrome={false}
                placement="top"
                trigger="hover"
                tooltip={<TooltipNote note="Re-run Diff" />}
              >
                <BadgeActionButton
                  type="button"
                  disabled={busy || storyMissing}
                  onClick={() => onReRunDiff?.()}
                  aria-label="Re-run Diff"
                >
                  Diff
                </BadgeActionButton>
              </WithTooltip>
            </>
          ) : null}
        </ControlsGroup>
        <RightGroup>
          {empty ? (
            <Button
              size="small"
              ariaLabel="Create visual baseline"
              disabled={busy || storyMissing}
              onClick={onCreate}
            >
              {createLabel}
            </Button>
          ) : (
            <>
              <AcceptSplitButton
                busy={busy}
                disabled={storyMissing || skipVisual}
                onAccept={onAccept}
                onUnaccept={onUnaccept}
              />
              <ReviewStatusPad
                value={reviewStatus}
                disabled={busy || storyMissing || skipVisual}
                onSelect={onReviewStatus}
              />
            </>
          )}
          <WithTooltip
            hasChrome={false}
            placement="top"
            trigger="hover"
            tooltip={
              <TooltipNote
                note={
                  reviewLayoutActive
                    ? "Exit review layout"
                    : "Review layout — canvas on top, Visual Delta below"
                }
              />
            }
          >
            <IconButton
              size="small"
              variant="ghost"
              padding="small"
              active={reviewLayoutActive}
              ariaLabel={reviewLayoutLabel}
              title={reviewLayoutLabel}
              onClick={toggleReviewLayout}
            >
              {reviewLayoutActive ? <CloseIcon /> : <ExpandIcon />}
            </IconButton>
          </WithTooltip>
          <PopoverProvider
            ariaLabel="More actions"
            placement="bottom-end"
            padding={0}
            visible={moreOpen}
            onVisibleChange={(open) => {
              setMoreOpen(open);
              if (!open && pendingReviewToggle.current) {
                pendingReviewToggle.current = false;
                toggleReviewLayout();
              }
            }}
            popover={() => (
              <div style={{ minWidth: 220 }}>
                <ActionList>
                  {!empty ? (
                    <ActionList.Item>
                      <ActionList.Action
                        ariaLabel="Update baselines"
                        disabled={busy || storyMissing || skipVisual}
                        onClick={() => {
                          setMoreOpen(false);
                          onUpdateBaselines();
                        }}
                      >
                        <ActionList.Icon>
                          <SyncIcon />
                        </ActionList.Icon>
                        <ActionList.Text>
                          {isUpdating ? "Updating…" : "Update baselines"}
                        </ActionList.Text>
                      </ActionList.Action>
                    </ActionList.Item>
                  ) : null}
                  <ActionList.Item>
                    <ActionList.Action
                      ariaLabel={skipActionLabel}
                      disabled={busy || storyMissing}
                      title={skipActionNote}
                      onClick={() => {
                        setMoreOpen(false);
                        onToggleSkipVisual();
                      }}
                    >
                      <ActionList.Icon>
                        {skipVisual ? <EyeIcon /> : <EyeCloseIcon />}
                      </ActionList.Icon>
                      <ActionList.Text>{skipActionLabel}</ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                  <ActionList.Item>
                    <ActionList.Action
                      ariaLabel={reviewLayoutLabel}
                      title={
                        reviewLayoutActive
                          ? "Restore sidebar and prior panel position"
                          : "Hide sidebar; dock Visual Delta full width under the canvas"
                      }
                      onClick={() => {
                        pendingReviewToggle.current = true;
                        setMoreOpen(false);
                      }}
                    >
                      <ActionList.Icon>
                        {reviewLayoutActive ? <CloseIcon /> : <ExpandIcon />}
                      </ActionList.Icon>
                      <ActionList.Text>{reviewLayoutLabel}</ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                  <ActionList.Item>
                    <ActionList.Action
                      ariaLabel="Configuration"
                      onClick={() => {
                        setMoreOpen(false);
                        onOpenConfiguration();
                      }}
                    >
                      <ActionList.Icon>
                        <EllipsisIcon />
                      </ActionList.Icon>
                      <ActionList.Text>Configuration</ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                  <ActionList.Item>
                    <ActionList.Action
                      ariaLabel="Reset settings"
                      onClick={() => {
                        setMoreOpen(false);
                        onResetSettings();
                      }}
                    >
                      <ActionList.Icon>
                        <UndoIcon />
                      </ActionList.Icon>
                      <ActionList.Text>Reset settings</ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                </ActionList>
              </div>
            )}
          >
            <IconButton
              size="small"
              variant="ghost"
              padding="small"
              ariaLabel="More actions"
              title="More actions"
            >
              <EllipsisIcon />
            </IconButton>
          </PopoverProvider>
        </RightGroup>
      </Toolbar>
    </HeaderWrap>
  );
});
