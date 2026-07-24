import React, { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronSmallDownIcon,
  PlayHollowIcon,
  StopAltIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";

/** Live Diff capture engine. */
export type DiffCaptureEngine = "html" | "chromium";

const DIFF_ENGINE_KEY = "storybook-addon-visual-delta/diff-capture-engine-v1";

const Split = styled.div<{ $compact?: boolean }>(({ theme, $compact }) => ({
  display: "inline-flex",
  alignItems: "stretch",
  gap: 0,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: $compact ? 3 : (theme.appBorderRadius ?? 4),
  overflow: "hidden",
  background: theme.background.content,
  height: $compact ? 24 : undefined,
}));

const MainButton = styled(Button)<{ $compact?: boolean }>(({ $compact }) => ({
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
  border: "none",
  boxShadow: "none",
  gap: $compact ? 4 : undefined,
  fontSize: $compact ? 11 : undefined,
  fontWeight: $compact ? 600 : undefined,
  height: $compact ? 22 : undefined,
  minHeight: $compact ? 22 : undefined,
  paddingTop: $compact ? 0 : undefined,
  paddingBottom: $compact ? 0 : undefined,
  paddingLeft: $compact ? 6 : undefined,
  paddingRight: $compact ? 6 : undefined,
  "& svg": {
    width: $compact ? 12 : undefined,
    height: $compact ? 12 : undefined,
  },
}));

const MenuButton = styled(Button)<{ $compact?: boolean }>(
  ({ theme, $compact }) => ({
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    border: "none",
    borderLeft: `1px solid ${theme.appBorderColor}`,
    borderRadius: 0,
    boxShadow: "none",
    marginLeft: 0,
    minWidth: $compact ? 20 : 24,
    height: $compact ? 22 : undefined,
    minHeight: $compact ? 22 : undefined,
    paddingLeft: $compact ? 2 : 2,
    paddingRight: $compact ? 2 : 2,
    paddingTop: 0,
    paddingBottom: 0,
    "& svg": {
      width: $compact ? 12 : undefined,
      height: $compact ? 12 : undefined,
    },
  }),
);

const ActionLabel = styled.span({
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
});

const ENGINES: readonly DiffCaptureEngine[] = ["html", "chromium"];

export function diffEngineLabel(engine: DiffCaptureEngine): string {
  return engine === "chromium" ? "Diff Chromium" : "Diff HTML";
}

export function diffEngineTooltip(engine: DiffCaptureEngine): string {
  if (engine === "chromium") {
    return "Compare via Playwright Chromium screenshot (matches committed baselines)";
  }
  return "Compare via html-to-image (fast; variable fonts may differ from baselines)";
}

function loadEngine(): DiffCaptureEngine {
  if (typeof localStorage === "undefined") return "html";
  try {
    const raw = localStorage.getItem(DIFF_ENGINE_KEY);
    if (raw === "chromium" || raw === "html") return raw;
  } catch {
    /* ignore */
  }
  return "html";
}

function saveEngine(engine: DiffCaptureEngine) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DIFF_ENGINE_KEY, engine);
  } catch {
    /* ignore */
  }
}

/**
 * Panel Diff control: split button with HTML vs Chromium capture engines.
 * Kept separate from the Story / Component / All run split button.
 */
export function DiffCaptureSplitButton({
  isRunning,
  disabled,
  storyMissing,
  onDiff,
  onStop,
  compact = true,
  progressLabel,
}: {
  isRunning: boolean;
  disabled?: boolean;
  storyMissing?: boolean;
  onDiff: (engine: DiffCaptureEngine) => void;
  onStop: () => void;
  compact?: boolean;
  progressLabel?: string | null;
}) {
  const [engine, setEngine] = useState<DiffCaptureEngine>(() => loadEngine());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    saveEngine(engine);
  }, [engine]);

  const selectEngine = useCallback((next: DiffCaptureEngine) => {
    setEngine(next);
    setMenuOpen(false);
  }, []);

  if (isRunning) {
    const runningLabel = progressLabel?.trim() || "Stop";
    return (
      <Split $compact={compact}>
        <MainButton
          size="small"
          variant="ghost"
          padding="small"
          $compact={compact}
          ariaLabel={progressLabel ? `${progressLabel}. Stop` : "Stop"}
          title={progressLabel ? `${progressLabel} — click to stop` : "Stop"}
          onClick={onStop}
        >
          <StopAltIcon />
          <ActionLabel>{runningLabel}</ActionLabel>
        </MainButton>
      </Split>
    );
  }

  const tip = diffEngineTooltip(engine);
  const label = diffEngineLabel(engine);
  const playDisabled = Boolean(disabled) || Boolean(storyMissing);

  return (
    <Split $compact={compact}>
      <MainButton
        size="small"
        variant="ghost"
        padding="small"
        $compact={compact}
        ariaLabel={tip}
        title={tip}
        disabled={playDisabled}
        onClick={() => onDiff(engine)}
      >
        <PlayHollowIcon />
        <ActionLabel>{label}</ActionLabel>
      </MainButton>
      <PopoverProvider
        ariaLabel="Choose Diff capture engine"
        placement="bottom-end"
        padding={0}
        visible={menuOpen}
        onVisibleChange={setMenuOpen}
        popover={() => (
          <div style={{ minWidth: 200 }}>
            <ActionList>
              {ENGINES.map((item) => (
                <ActionList.Item key={item} active={engine === item}>
                  <ActionList.Action
                    ariaLabel={diffEngineLabel(item)}
                    title={diffEngineTooltip(item)}
                    onClick={() => selectEngine(item)}
                  >
                    <ActionList.Icon>
                      {engine === item ? <CheckIcon /> : <span />}
                    </ActionList.Icon>
                    <ActionList.Text>{diffEngineLabel(item)}</ActionList.Text>
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
          $compact={compact}
          ariaLabel="Choose Diff HTML or Diff Chromium"
          title="Choose Diff capture engine"
          disabled={disabled}
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
