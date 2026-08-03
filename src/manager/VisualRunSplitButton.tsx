import React, { useCallback, useEffect, useMemo, useState } from "react";
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

/** Sidebar scopes. Panel also allows Affected / All (Diff is separate). */
export type ScopedRunMode = "component" | "story";
export type PanelRunMode = ScopedRunMode | "affected" | "all";
export type VisualRunMode = PanelRunMode;

const SIDEBAR_SCOPE_KEY = "storybook-addon-visual-delta/run-scope-v2";
const PANEL_SCOPE_KEY = "storybook-addon-visual-delta/panel-run-scope-v2";

const PANEL_MODES = [
  "story",
  "component",
  "affected",
  "all",
] as const satisfies readonly VisualRunMode[];

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

function loadMode(
  key: string,
  fallback: VisualRunMode,
  allowed: readonly VisualRunMode[],
): VisualRunMode {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    // Migrate older panel prefs that mixed Diff into this control.
    if (raw === "diff" || raw === "diff-html" || raw === "diff-chromium") {
      return fallback;
    }
    if (raw && (allowed as readonly string[]).includes(raw)) {
      return raw as VisualRunMode;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function saveMode(key: string, mode: VisualRunMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, mode);
  } catch {
    /* ignore */
  }
}

export function modeActionLabel(mode: VisualRunMode): string {
  if (mode === "story") return "Story";
  if (mode === "affected") return "Affected";
  if (mode === "all") return "All";
  return "Component";
}

/** Tooltip / aria copy for the action the play button will execute. */
export function modeActionTooltip(mode: VisualRunMode): string {
  if (mode === "story") return "Run visual test for this story";
  if (mode === "affected") return "Run only affected visual tests";
  if (mode === "all") return "Run all visual tests";
  return "Run visual tests for this component";
}

/** @deprecated use modeActionTooltip */
export function scopeActionTooltip(scope: ScopedRunMode): string {
  return modeActionTooltip(scope);
}

export function VisualRunSplitButton({
  isRunning,
  disabled,
  storyMissing,
  onRun,
  onFreshRun,
  onStop,
  allowStory = true,
  /** Visual Delta panel: show label, include All. */
  panel = false,
  compact = true,
  /** Shown next to Stop while a Playwright visual run is in progress. */
  progressLabel,
}: {
  isRunning: boolean;
  disabled?: boolean;
  /** Story/Component need a selected story; All does not. */
  storyMissing?: boolean;
  onRun: (mode: VisualRunMode) => void;
  onFreshRun?: (mode: VisualRunMode) => void;
  onStop: () => void;
  allowStory?: boolean;
  panel?: boolean;
  /** Match GhostButton / Reset settings scale (default true). */
  compact?: boolean;
  progressLabel?: string | null;
}) {
  const allowed = useMemo((): readonly VisualRunMode[] => {
    if (panel) return PANEL_MODES;
    if (allowStory) return ["story", "component"] as const;
    return ["component"] as const;
  }, [panel, allowStory]);

  const storageKey = panel ? PANEL_SCOPE_KEY : SIDEBAR_SCOPE_KEY;
  const fallback: VisualRunMode = "story";

  const [mode, setMode] = useState<VisualRunMode>(() =>
    loadMode(storageKey, fallback, allowed),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!allowed.includes(mode)) {
      setMode(fallback);
      saveMode(storageKey, fallback);
    }
  }, [allowed, fallback, mode, storageKey]);

  const selectMode = useCallback(
    (next: VisualRunMode) => {
      setMode(next);
      saveMode(storageKey, next);
      setMenuOpen(false);
    },
    [storageKey],
  );

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
          {panel ? <ActionLabel>{runningLabel}</ActionLabel> : null}
        </MainButton>
      </Split>
    );
  }

  const tip = modeActionTooltip(mode);
  const label = modeActionLabel(mode);
  const needsStory = mode === "story" || mode === "component";
  const playDisabled =
    Boolean(disabled) || (needsStory && Boolean(storyMissing));

  const menuItems = allowed.map((item) => (
    <ActionList.Item key={item} active={mode === item}>
      <ActionList.Action
        ariaLabel={`Use ${modeActionLabel(item)}`}
        onClick={() => selectMode(item)}
      >
        <ActionList.Icon>
          {mode === item ? <CheckIcon /> : <span />}
        </ActionList.Icon>
        <ActionList.Text>{modeActionLabel(item)}</ActionList.Text>
      </ActionList.Action>
    </ActionList.Item>
  ));
  if (onFreshRun) {
    menuItems.push(
      <ActionList.Item key="fresh">
        <ActionList.Action
          ariaLabel={`Run ${modeActionLabel(mode)} fresh`}
          onClick={() => {
            setMenuOpen(false);
            onFreshRun(mode);
          }}
        >
          <ActionList.Icon><PlayHollowIcon /></ActionList.Icon>
          <ActionList.Text>Run fresh</ActionList.Text>
        </ActionList.Action>
      </ActionList.Item>,
    );
  }

  if (allowed.length === 1 && !onFreshRun) {
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
          onClick={() => onRun(mode)}
        >
          <PlayHollowIcon />
          {panel ? <ActionLabel>{label}</ActionLabel> : null}
        </MainButton>
      </Split>
    );
  }

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
        onClick={() => onRun(mode)}
      >
        <PlayHollowIcon />
        {panel ? <ActionLabel>{label}</ActionLabel> : null}
      </MainButton>
      <PopoverProvider
        ariaLabel="Choose action"
        placement="bottom-end"
        padding={0}
        visible={menuOpen}
        onVisibleChange={setMenuOpen}
        popover={() => (
          <div style={{ minWidth: 200 }}>
            <ActionList>{menuItems}</ActionList>
          </div>
        )}
      >
        <MenuButton
          size="small"
          variant="ghost"
          padding="small"
          $compact={compact}
          ariaLabel={
            panel
              ? "Choose Story, Component, Affected, or All"
              : "Choose Story or Component"
          }
          title="Choose action"
          disabled={disabled}
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
