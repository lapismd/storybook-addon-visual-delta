import React, { useMemo, useState } from "react";
import {
  BrowserIcon,
  CheckIcon,
  ChevronSmallDownIcon,
  LinuxIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";

export type EnvironmentOption = {
  value: string;
  label: string;
  enabled?: boolean;
};

const Split = styled.div(({ theme }) => ({
  display: "inline-flex",
  alignItems: "stretch",
  flex: "0 0 auto",
  height: 24,
  overflow: "hidden",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 3,
  background: theme.background.content,
}));

const Segment = styled(Button)<{ $right?: boolean }>(({ theme, $right }) => ({
  minWidth: 0,
  height: 22,
  minHeight: 22,
  padding: "0 5px",
  gap: 4,
  border: "none",
  borderLeft: $right ? `1px solid ${theme.appBorderColor}` : "none",
  borderRadius: 0,
  boxShadow: "none",
  fontSize: 11,
  fontWeight: 600,
  "& svg": {
    width: 12,
    height: 12,
    flexShrink: 0,
  },
}));

const ProfileSegment = styled.div(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  minWidth: 0,
  height: 22,
  padding: "0 6px",
  gap: 4,
  color: theme.color.defaultText,
  fontSize: 11,
  fontWeight: 600,
  cursor: "help",
  "& svg": {
    width: 12,
    height: 12,
    flexShrink: 0,
  },
}));

const TriggerLabel = styled.span({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

function selectedLabel(options: EnvironmentOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function EnvironmentMenu({
  options,
  value,
  onSelect,
}: {
  options: EnvironmentOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div style={{ minWidth: 170 }}>
      <ActionList>
        {options.map((option) => (
          <ActionList.Item key={option.value} active={value === option.value}>
            <ActionList.Action
              ariaLabel={option.label}
              onClick={() => onSelect(option.value)}
            >
              <ActionList.Icon>
                {value === option.value ? <CheckIcon /> : <span />}
              </ActionList.Icon>
              <ActionList.Text>{option.label}</ActionList.Text>
            </ActionList.Action>
          </ActionList.Item>
        ))}
      </ActionList>
    </div>
  );
}

export function EnvironmentSplitButton({
  browser,
  browsers,
  onBrowserChange,
  captureProfileId = "visual-delta-linux-arm64-v1",
}: {
  browser: string;
  browsers: EnvironmentOption[];
  onBrowserChange: (value: string) => void;
  captureProfileId?: string;
}) {
  const [open, setOpen] = useState<"browser" | null>(null);
  const browserLabel = useMemo(
    () => selectedLabel(browsers, browser),
    [browser, browsers],
  );

  return (
    <Split role="group" aria-label="Visual baseline target">
      <ProfileSegment
        aria-label="Canonical capture profile: Linux ARM64"
        title={`Canonical capture profile: Linux · ARM64 (${captureProfileId})`}
      >
        <LinuxIcon />
        <TriggerLabel>Linux · ARM64</TriggerLabel>
      </ProfileSegment>
      <PopoverProvider
        ariaLabel="Choose baseline browser"
        placement="top-end"
        padding={0}
        visible={open === "browser"}
        onVisibleChange={(visible) => setOpen(visible ? "browser" : null)}
        popover={() => (
          <EnvironmentMenu
            options={browsers}
            value={browser}
            onSelect={(value) => {
              onBrowserChange(value);
              setOpen(null);
            }}
          />
        )}
      >
        <Segment
          $right
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel="Visual baseline browser"
          title={`Browser: ${browserLabel}`}
        >
          <BrowserIcon />
          <TriggerLabel>{browserLabel}</TriggerLabel>
          <ChevronSmallDownIcon />
        </Segment>
      </PopoverProvider>
    </Split>
  );
}
