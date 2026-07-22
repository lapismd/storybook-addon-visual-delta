import React, { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronSmallDownIcon,
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

function loadMode(): BaselineWriteMode {
  if (typeof localStorage === "undefined") return "create";
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "rewrite" ? "rewrite" : "create";
  } catch {
    return "create";
  }
}

function saveMode(mode: BaselineWriteMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function baselineModeLabel(mode: BaselineWriteMode): string {
  return mode === "rewrite" ? "Rewrite existing" : "Create missing";
}

export function baselineModeTooltip(mode: BaselineWriteMode): string {
  return mode === "rewrite"
    ? "Overwrite existing baselines (clears approved badges)"
    : "Create missing baselines only";
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
 * Trailing Testing Module control for Create Baselines: Sync + status + split
 * menu to choose create-missing vs rewrite-existing.
 */
export function VisualBaselineSplitButton({
  status,
  isRunning,
  disabled,
  ariaLabel,
  tooltip,
  onCreateMissing,
  onRewriteExisting,
  onStop,
}: {
  status: ChipStatus;
  isRunning?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  tooltip: string;
  onCreateMissing: () => void;
  onRewriteExisting: () => void;
  onStop: () => void;
}) {
  const [mode, setMode] = useState<BaselineWriteMode>(() => loadMode());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    saveMode(mode);
  }, [mode]);

  const selectMode = useCallback((next: BaselineWriteMode) => {
    setMode(next);
    setMenuOpen(false);
  }, []);

  if (isRunning) {
    return (
      <Split>
        <MainButton
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel="Stop baseline write"
          title="Stop baseline write"
          onClick={onStop}
        >
          <StopAltIcon />
          <StatusDot status={status} isRunning />
        </MainButton>
      </Split>
    );
  }

  const tip = `${tooltip} · ${baselineModeTooltip(mode)}`;

  return (
    <Split>
      <MainButton
        size="small"
        variant="ghost"
        padding="small"
        ariaLabel={`${ariaLabel}. ${baselineModeLabel(mode)}`}
        title={tip}
        disabled={disabled}
        onClick={() => {
          if (mode === "rewrite") onRewriteExisting();
          else onCreateMissing();
        }}
      >
        <SyncIcon />
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
          disabled={disabled}
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
