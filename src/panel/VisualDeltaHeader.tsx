import React, { memo, useLayoutEffect, useRef } from "react";
import {
  CloseIcon,
  EllipsisIcon,
  ExpandIcon,
  EyeCloseIcon,
  EyeIcon,
  RefreshIcon,
  SyncIcon,
  UndoIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
  Separator,
  ToggleButton,
  Toolbar,
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
  flex: "1 0 auto",
  gap: 6,
  minWidth: "max-content",
});

const RightGroup = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  marginLeft: "auto",
  maxWidth: "100%",
  overflowX: "auto",
});

export type VisualDeltaHeaderProps = {
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
  /** Selected Diff capture engine (HTML vs Chromium). */
  diffEngine: DiffCaptureEngine;
  onDiffEngineChange: (engine: DiffCaptureEngine) => void;
  onCreate: () => void;
  onUpdateBaselines: () => void;
  /** Force `build-storybook` without capturing baselines. */
  onRebuildStatic: () => void;
  onResetSettings: () => void;
  onStopDiff: () => void;
  onStopRun: () => void;
  onReviewStatus: (status: VisualReviewStatus) => void;
  onAccept: (scope: AcceptScope) => void;
  onUnaccept: (scope: AcceptScope) => void;
  acceptRunAvailable?: boolean;
  onToggleSkipVisual: () => void;
  onOpenConfiguration: () => void;
  isUpdating: boolean;
  isRebuilding: boolean;
  /** Reports sticky Pass/Diff toolbar height for accordion offset. */
  onHeightChange?: (height: number) => void;
};

export type VisualDeltaHeaderViewProps = VisualDeltaHeaderProps & {
  reviewLayoutActive?: boolean;
  onToggleReviewLayout?: () => void;
};

export const VisualDeltaHeaderView = memo(function VisualDeltaHeaderView({
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
  diffEngine,
  onDiffEngineChange,
  onCreate,
  onUpdateBaselines,
  onRebuildStatic,
  onResetSettings,
  onStopDiff,
  onStopRun,
  onReviewStatus,
  onAccept,
  onUnaccept,
  acceptRunAvailable = false,
  onToggleSkipVisual,
  onOpenConfiguration,
  isUpdating,
  isRebuilding,
  onHeightChange,
  reviewLayoutActive = false,
  onToggleReviewLayout = () => undefined,
}: VisualDeltaHeaderViewProps) {
  const theme = useTheme();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const pendingReviewToggle = useRef(false);
  const toggleReviewLayout = onToggleReviewLayout;
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
  /** Prominent header control when there is no baseline, or skip is already on. */
  const showSkipHeaderButton = empty || skipVisual;

  return (
    <HeaderWrap ref={headerRef} data-vd-header="controls">
      <Toolbar
        backgroundColor={theme.background.app}
        innerStyle={{
          gap: 6,
          paddingInline: 15,
          paddingBlock: 4,
          flexWrap: "wrap",
          height: "auto",
        }}
        aria-label="Visual Delta controls"
      >
        <ControlsGroup>
          <DiffCaptureSplitButton
            compact
            isRunning={isDiffing}
            progressLabel={diffProgressLabel}
            disabled={busy && !isDiffing}
            storyMissing={storyMissing}
            engine={diffEngine}
            onEngineChange={onDiffEngineChange}
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
            </>
          ) : null}
        </ControlsGroup>
        <RightGroup>
          {empty && !skipVisual ? (
            <Button
              size="small"
              ariaLabel="Create visual baseline"
              disabled={busy || storyMissing}
              onClick={onCreate}
            >
              {createLabel}
            </Button>
          ) : null}
          {showSkipHeaderButton ? (
            <Button
              size="small"
              variant={skipVisual ? "solid" : "ghost"}
              ariaLabel={skipActionLabel}
              title={skipActionNote}
              disabled={busy || storyMissing}
              onClick={onToggleSkipVisual}
            >
              {skipVisual ? <EyeIcon /> : <EyeCloseIcon />}
              {skipActionLabel}
            </Button>
          ) : null}
          {!empty && !skipVisual ? (
            <>
              <AcceptSplitButton
                busy={busy}
                disabled={storyMissing || skipVisual}
                runAvailable={acceptRunAvailable}
                onAccept={onAccept}
                onUnaccept={onUnaccept}
              />
              <ReviewStatusPad
                value={reviewStatus}
                disabled={busy || storyMissing || skipVisual}
                onSelect={onReviewStatus}
              />
            </>
          ) : null}
          <ToggleButton
            size="small"
            variant="ghost"
            padding="small"
            pressed={reviewLayoutActive}
            ariaLabel={reviewLayoutLabel}
            title={
              reviewLayoutActive
                ? "Exit review layout"
                : "Review layout — canvas on top, Visual Delta below"
            }
            onClick={toggleReviewLayout}
          >
            {reviewLayoutActive ? <CloseIcon /> : <ExpandIcon />}
          </ToggleButton>
          <PopoverProvider
            ariaLabel="More Visual Delta actions"
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
                      ariaLabel="Rebuild storybook static"
                      title="Run build-storybook so Playwright captures pick up live CSS/markup edits"
                      disabled={busy}
                      onClick={() => {
                        setMoreOpen(false);
                        onRebuildStatic();
                      }}
                    >
                      <ActionList.Icon>
                        <RefreshIcon />
                      </ActionList.Icon>
                      <ActionList.Text>
                        {isRebuilding
                          ? "Rebuilding static…"
                          : "Rebuild storybook static"}
                      </ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                  {!showSkipHeaderButton ? (
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
                  ) : null}
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
            <Button
              size="small"
              variant="ghost"
              padding="small"
              ariaLabel="More Visual Delta actions"
              title="More actions"
            >
              <EllipsisIcon />
            </Button>
          </PopoverProvider>
        </RightGroup>
      </Toolbar>
    </HeaderWrap>
  );
});

/** Manager-connected header; deterministic stories render VisualDeltaHeaderView. */
export const VisualDeltaHeader = memo(function VisualDeltaHeader(
  props: VisualDeltaHeaderProps,
) {
  const { active, toggle } = useReviewLayoutToggle();
  return (
    <VisualDeltaHeaderView
      {...props}
      reviewLayoutActive={active}
      onToggleReviewLayout={toggle}
    />
  );
});
