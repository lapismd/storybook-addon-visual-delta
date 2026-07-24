import React, { useCallback, useState } from "react";
import { ChevronSmallDownIcon, VerifiedIcon, UndoIcon } from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";

export type AcceptScope = "story" | "component";

const STORAGE_KEY = "storybook-addon-visual-delta/accept-scope-v1";

function loadScope(): AcceptScope {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "component") return "component";
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
 * Chromatic-style Accept / Unaccept with story vs component batch scope.
 * Accept → `visual-approved`; Unaccept → `visual-pending`.
 */
export function AcceptSplitButton({
  busy = false,
  disabled = false,
  onAccept,
  onUnaccept,
}: {
  busy?: boolean;
  disabled?: boolean;
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

  const acceptLabel =
    scope === "component" ? "Accept component" : "Accept story";
  const unacceptLabel =
    scope === "component" ? "Unaccept component" : "Unaccept story";

  return (
    <Split role="group" aria-label="Accept or unaccept baselines">
      <MainButton
        size="small"
        disabled={disabled || busy}
        ariaLabel={acceptLabel}
        onClick={() => onAccept(scope)}
      >
        <VerifiedIcon />
        {scope === "component" ? "Accept all" : "Accept"}
      </MainButton>
      <MainButton
        size="small"
        disabled={disabled || busy}
        ariaLabel={unacceptLabel}
        onClick={() => onUnaccept(scope)}
        style={{ borderLeft: "1px solid var(--sb-color-border, #0002)" }}
      >
        <UndoIcon />
        Unaccept
      </MainButton>
      <PopoverProvider
        placement="bottom"
        padding={0}
        visible={menuOpen}
        onVisibleChange={setMenuOpen}
        popover={
          <div style={{ minWidth: 180 }}>
            <ActionList>
              <ActionList.Item>
                <ActionList.Action
                  ariaLabel="Story scope"
                  onClick={() => chooseScope("story")}
                >
                  <ActionList.Text>
                    {scope === "story" ? "✓ Story scope" : "Story scope"}
                  </ActionList.Text>
                </ActionList.Action>
              </ActionList.Item>
              <ActionList.Item>
                <ActionList.Action
                  ariaLabel="Component scope"
                  onClick={() => chooseScope("component")}
                >
                  <ActionList.Text>
                    {scope === "component"
                      ? "✓ Component scope"
                      : "Component scope"}
                  </ActionList.Text>
                </ActionList.Action>
              </ActionList.Item>
            </ActionList>
          </div>
        }
      >
        <MenuButton
          size="small"
          disabled={disabled || busy}
          ariaLabel="Accept scope"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <ChevronSmallDownIcon />
        </MenuButton>
      </PopoverProvider>
    </Split>
  );
}
