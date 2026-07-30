import React, { useCallback, useState } from "react";
import {
  CheckIcon,
  ChevronSmallDownIcon,
  UndoIcon,
  VerifiedIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";

export type AcceptScope = "story" | "component" | "run";

const STORAGE_KEY = "storybook-addon-visual-delta/accept-scope-v1";

const SCOPES: readonly AcceptScope[] = ["story", "component", "run"];

function loadScope(): AcceptScope {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "component" || raw === "run") return raw;
  } catch {
    /* ignore */
  }
  return "story";
}

function saveScope(scope: AcceptScope): void {
  try {
    localStorage.setItem(STORAGE_KEY, scope);
  } catch {
    /* ignore */
  }
}

function scopeLabel(scope: AcceptScope): string {
  if (scope === "component") return "Component scope";
  if (scope === "run") return "Current run scope";
  return "Story scope";
}

const Split = styled.div(({ theme }) => ({
  display: "inline-flex",
  alignItems: "stretch",
  gap: 0,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 3,
  overflow: "hidden",
  background: theme.background.content,
  height: 28,
}));

const MainButton = styled(Button)({
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
  border: "none",
  boxShadow: "none",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  height: 26,
  minHeight: 26,
  paddingTop: 0,
  paddingBottom: 0,
  paddingLeft: 8,
  paddingRight: 8,
  "& svg": {
    width: 12,
    height: 12,
  },
});

/** Middle segment: flat corners + straight themed divider (matches chevron). */
const MidButton = styled(MainButton)(({ theme }) => ({
  borderRadius: 0,
  borderLeft: `1px solid ${theme.appBorderColor}`,
}));

const MenuButton = styled(Button)(({ theme }) => ({
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  border: "none",
  borderLeft: `1px solid ${theme.appBorderColor}`,
  borderRadius: 0,
  boxShadow: "none",
  minWidth: 20,
  height: 26,
  minHeight: 26,
  paddingLeft: 2,
  paddingRight: 2,
  paddingTop: 0,
  paddingBottom: 0,
  "& svg": {
    width: 12,
    height: 12,
  },
}));

/**
 * Chromatic-style Accept / Unaccept with story vs component vs current-run scope.
 * Story/component: Accept → approved; Unaccept → pending.
 * Current run: Accept → passes only; Unaccept → mismatches → failed.
 */
export function AcceptSplitButton({
  busy = false,
  disabled = false,
  runAcceptAvailable = false,
  runRejectAvailable = false,
  onAccept,
  onUnaccept,
}: {
  busy?: boolean;
  disabled?: boolean;
  /** Last run has at least one passed / within-tolerance result. */
  runAcceptAvailable?: boolean;
  /** Last run has at least one mismatch result. */
  runRejectAvailable?: boolean;
  onAccept: (scope: AcceptScope) => void;
  onUnaccept: (scope: AcceptScope) => void;
}) {
  const [scope, setScope] = useState<AcceptScope>(loadScope);
  const [menuOpen, setMenuOpen] = useState(false);

  const chooseScope = useCallback((next: AcceptScope) => {
    setScope(next);
    saveScope(next);
    setMenuOpen(false);
  }, []);

  const runScopeSelectable = runAcceptAvailable || runRejectAvailable;
  const acceptLabel =
    scope === "component"
      ? "Accept component"
      : scope === "run"
        ? "Accept current run (passes only)"
        : "Accept story";
  const unacceptLabel =
    scope === "component"
      ? "Unaccept component"
      : scope === "run"
        ? "Unaccept current run (fail mismatches)"
        : "Unaccept story";
  const acceptDisabled =
    disabled || busy || (scope === "run" && !runAcceptAvailable);
  const unacceptDisabled =
    disabled || busy || (scope === "run" && !runRejectAvailable);

  return (
    <Split role="group" aria-label="Accept or unaccept baselines">
      <MainButton
        size="small"
        variant="ghost"
        padding="small"
        disabled={acceptDisabled}
        ariaLabel={acceptLabel}
        title={acceptLabel}
        onClick={() => onAccept(scope)}
      >
        <VerifiedIcon />
        {scope === "story" ? "Accept" : "Accept all"}
      </MainButton>
      <MidButton
        size="small"
        variant="ghost"
        padding="small"
        disabled={unacceptDisabled}
        ariaLabel={unacceptLabel}
        title={unacceptLabel}
        onClick={() => onUnaccept(scope)}
      >
        <UndoIcon />
        Unaccept
      </MidButton>
      <PopoverProvider
        ariaLabel="Choose Accept scope"
        placement="bottom-end"
        padding={0}
        visible={menuOpen}
        onVisibleChange={setMenuOpen}
        popover={() => (
          <div style={{ minWidth: 180 }}>
            <ActionList>
              {SCOPES.map((item) => (
                <ActionList.Item key={item} active={scope === item}>
                  <ActionList.Action
                    ariaLabel={scopeLabel(item)}
                    disabled={item === "run" && !runScopeSelectable}
                    onClick={() => chooseScope(item)}
                  >
                    <ActionList.Icon>
                      {scope === item ? <CheckIcon /> : <span />}
                    </ActionList.Icon>
                    <ActionList.Text>{scopeLabel(item)}</ActionList.Text>
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
          disabled={disabled || busy}
          ariaLabel="Choose Accept story, component, or current run scope"
          title="Choose Accept scope"
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
