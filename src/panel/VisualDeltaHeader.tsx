import React, { memo } from "react";
import { EllipsisIcon, SyncIcon, UndoIcon } from "@storybook/icons";
import {
  ActionList,
  Button,
  IconButton,
  PopoverProvider,
  Separator,
  Toolbar,
} from "storybook/internal/components";
import { styled, useTheme } from "storybook/theming";
import type { VisualReviewStatus } from "../constants.js";
import {
  VisualRunSplitButton,
  type VisualRunMode,
} from "../manager/VisualRunSplitButton.js";
import { ReviewStatusPad } from "./ReviewStatusPad.js";
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
  zIndex: 1,
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
  isRunning,
  progressLabel,
  createLabel,
  reviewStatus,
  onRunDiff,
  onCreate,
  onUpdateBaselines,
  onResetSettings,
  onStop,
  onReviewStatus,
  isUpdating,
}: {
  badgeStatus: VisualBadgeStatus | null;
  empty: boolean;
  busy: boolean;
  storyMissing: boolean;
  isRunning: boolean;
  progressLabel: string | null;
  createLabel: string;
  reviewStatus: VisualReviewStatus | null;
  onRunDiff: (mode: VisualRunMode) => void;
  onCreate: () => void;
  onUpdateBaselines: () => void;
  onResetSettings: () => void;
  onStop: () => void;
  onReviewStatus: (status: VisualReviewStatus) => void;
  isUpdating: boolean;
}) {
  const theme = useTheme();
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <HeaderWrap>
      <Toolbar
        backgroundColor={theme.background.app}
        innerStyle={{ gap: 6, paddingInline: 15 }}
        aria-label="Visual Delta controls"
      >
        <ControlsGroup>
          {badgeStatus ? (
            <>
              <VisualStatusBadge status={badgeStatus} />
              <Separator />
              <BadgeActionButton
                type="button"
                disabled={busy || storyMissing}
                onClick={() => onRunDiff("diff")}
                aria-label="Re-run Diff"
              >
                Re-run Diff
              </BadgeActionButton>
            </>
          ) : (
            <VisualRunSplitButton
              panel
              compact
              isRunning={isRunning}
              progressLabel={progressLabel}
              disabled={busy && !isRunning}
              storyMissing={storyMissing}
              diffDisabled={false}
              allowStory
              onRun={onRunDiff}
              onStop={onStop}
            />
          )}
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
              <ReviewStatusPad
                value={reviewStatus}
                disabled={busy || storyMissing}
                onSelect={onReviewStatus}
              />
              <PopoverProvider
                ariaLabel="More actions"
                placement="bottom-end"
                padding={0}
                visible={moreOpen}
                onVisibleChange={setMoreOpen}
                popover={() => (
                  <div style={{ minWidth: 190 }}>
                    <ActionList>
                      <ActionList.Item>
                        <ActionList.Action
                          ariaLabel="Update baselines"
                          disabled={busy || storyMissing}
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
            </>
          )}
        </RightGroup>
      </Toolbar>
    </HeaderWrap>
  );
});
