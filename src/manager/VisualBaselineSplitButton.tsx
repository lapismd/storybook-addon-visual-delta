import React, { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronSmallDownIcon,
  PlayHollowIcon,
  StopAltIcon,
  SyncIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";

export type BaselineWriteMode = "create" | "rewrite";

const MODE_KEY = "storybook-addon-visual-delta/baseline-write-mode-v1";

/**
 * Trailing control sized like Testing Module `ActionList.Button` (~32px),
 * without clipping the 14px Storybook icons.
 */
const Split = styled.div(({ theme }) => ({
  display: "inline-flex",
  alignItems: "stretch",
  flexShrink: 0,
  height: 28,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius ?? 4,
  background: theme.background.content,
  boxSizing: "border-box",
  overflow: "visible",
}));

const MainButton = styled(Button)({
  border: "none !important",
  boxShadow: "none !important",
  borderRadius: "0 !important",
  height: "auto",
  minHeight: 0,
  minWidth: 32,
  padding: "0 6px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  flex: "1 1 auto",
  lineHeight: 0,
  "& svg": {
    width: "14px !important",
    height: "14px !important",
    flexShrink: 0,
    display: "block",
  },
});

const MenuButton = styled(Button)(({ theme }) => ({
  border: "none !important",
  boxShadow: "none !important",
  borderRadius: "0 !important",
  borderLeft: `1px solid ${theme.appBorderColor} !important`,
  height: "auto",
  minHeight: 0,
  minWidth: 24,
  width: 24,
  padding: 0,
  margin: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  lineHeight: 0,
  "& svg": {
    width: "14px !important",
    height: "14px !important",
    flexShrink: 0,
    display: "block",
  },
}));

export function loadBaselineWriteMode(): BaselineWriteMode {
  if (typeof localStorage === "undefined") return "create";
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "rewrite" ? "rewrite" : "create";
  } catch {
    return "create";
  }
}

export function saveBaselineWriteMode(mode: BaselineWriteMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Menu labels for Create missing / Rewrite existing. */
export function baselineModeLabel(mode: BaselineWriteMode): string {
  return mode === "rewrite" ? "Rewrite existing" : "Create missing";
}

export function baselineModeTooltip(mode: BaselineWriteMode): string {
  return mode === "rewrite"
    ? "Overwrite existing baselines (clears approved badges)"
    : "Create missing baselines only";
}

/** Testing Module row-2 checkbox label driven by write mode. */
export function baselineWriteRowLabel(mode: BaselineWriteMode): string {
  return mode === "rewrite" ? "Update baselines" : "Create missing Baselines";
}

type ChipStatus = "positive" | "negative" | "critical" | "warning" | "unknown";

const StatusDot = styled.span<{
  status: ChipStatus;
  isRunning?: boolean;
}>(({ status, isRunning, theme }) => {
  const color =
    status === "positive"
      ? theme.color.positive
      : status === "warning"
        ? theme.color.gold
        : status === "negative"
          ? theme.color.negative
          : status === "critical"
            ? theme.color.defaultText
            : theme.textMutedColor;

  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    display: "inline-block",
    backgroundColor: color,
    ...(isRunning
      ? { animation: `${theme.animation.glow} 1.5s ease-in-out infinite` }
      : null),
  };
});

/**
 * Trailing Testing Module / context-menu control: main action + status + split
 * menu for create-missing vs rewrite-existing.
 *
 * - Context menu: Sync icon, main click writes baselines.
 * - Global Testing Module heading: Play icon, main click runs selected actions.
 */
export function VisualBaselineSplitButton({
  status,
  isRunning,
  disabled,
  ariaLabel,
  tooltip,
  mode: modeProp,
  onModeChange,
  mainIcon = "sync",
  writeOnMainClick = true,
  onRun,
  onCreateMissing,
  onRewriteExisting,
  onStop,
}: {
  status: ChipStatus;
  isRunning?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  tooltip: string;
  /** Controlled write mode; omit to manage selection internally. */
  mode?: BaselineWriteMode;
  onModeChange?: (mode: BaselineWriteMode) => void;
  /** Main-button glyph: play (global runner) or sync (context-menu write). */
  mainIcon?: "play" | "sync";
  /**
   * When true (default), main click runs create/rewrite (sidebar context menu).
   * Ignored when `mainIcon` is `play` (uses `onRun` instead).
   */
  writeOnMainClick?: boolean;
  /** Global Testing Module: run the checked actions (compare / baselines / status). */
  onRun?: () => void;
  onCreateMissing?: () => void;
  onRewriteExisting?: () => void;
  onStop: () => void;
}) {
  const [internalMode, setInternalMode] = useState<BaselineWriteMode>(() =>
    loadBaselineWriteMode(),
  );
  const mode = modeProp ?? internalMode;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (modeProp !== undefined) return;
    saveBaselineWriteMode(internalMode);
  }, [modeProp, internalMode]);

  const selectMode = useCallback(
    (next: BaselineWriteMode) => {
      if (modeProp === undefined) {
        setInternalMode(next);
      } else {
        saveBaselineWriteMode(next);
      }
      onModeChange?.(next);
      setMenuOpen(false);
    },
    [modeProp, onModeChange],
  );

  if (isRunning) {
    return (
      <Split>
        <MainButton
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel={mainIcon === "play" ? "Stop visual run" : "Stop baseline write"}
          title={mainIcon === "play" ? "Stop visual run" : "Stop baseline write"}
          onClick={onStop}
        >
          <StopAltIcon />
          <StatusDot status={status} isRunning />
        </MainButton>
      </Split>
    );
  }

  const tip = `${tooltip} · ${baselineModeTooltip(mode)}`;
  const isPlay = mainIcon === "play";

  return (
    <Split>
      <MainButton
        size="small"
        variant="ghost"
        padding="small"
        ariaLabel={
          isPlay
            ? `${ariaLabel}. ${baselineModeLabel(mode)}`
            : `${ariaLabel}. ${baselineModeLabel(mode)}`
        }
        title={
          isPlay
            ? `${tip}. Runs the checked Testing Module actions.`
            : writeOnMainClick
              ? tip
              : `${tip}. Use Run tests to write baselines when enabled.`
        }
        disabled={Boolean(disabled)}
        onClick={() => {
          if (isPlay) {
            onRun?.();
            return;
          }
          if (!writeOnMainClick) return;
          if (mode === "rewrite") onRewriteExisting?.();
          else onCreateMissing?.();
        }}
      >
        {isPlay ? <PlayHollowIcon /> : <SyncIcon />}
        <StatusDot status={status} />
      </MainButton>
      <PopoverProvider
        ariaLabel="Choose baseline write mode"
        placement="bottom-end"
        padding={0}
        visible={menuOpen}
        onVisibleChange={setMenuOpen}
        popover={() => (
          <div style={{ minWidth: 180 }}>
            <ActionList>
              {(
                [
                  ["create", "Create missing"],
                  ["rewrite", "Rewrite existing"],
                ] as const
              ).map(([value, label]) => (
                <ActionList.Item key={value} active={mode === value}>
                  <ActionList.Action
                    ariaLabel={label}
                    onClick={() => selectMode(value)}
                  >
                    <ActionList.Icon>
                      {mode === value ? <CheckIcon /> : <span />}
                    </ActionList.Icon>
                    <ActionList.Text>{label}</ActionList.Text>
                  </ActionList.Action>
                </ActionList.Item>
              ))}
            </ActionList>
          </div>
        )}
      >
        <MenuButton
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel="Choose Create missing or Rewrite existing"
          title="Choose Create missing or Rewrite existing"
          disabled={Boolean(disabled)}
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
