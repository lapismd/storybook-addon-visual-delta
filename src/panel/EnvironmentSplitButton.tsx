import React, { useMemo, useState } from "react";
import {
  AppleIcon,
  BrowserIcon,
  CheckIcon,
  ChevronSmallDownIcon,
  LinuxIcon,
  WindowsIcon,
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

const TriggerLabel = styled.span({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

function selectedLabel(options: EnvironmentOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "linux") return <LinuxIcon />;
  if (platform === "win32") return <WindowsIcon />;
  return <AppleIcon />;
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
  platform,
  browsers,
  platforms,
  onBrowserChange,
  onPlatformChange,
}: {
  browser: string;
  platform: string;
  browsers: EnvironmentOption[];
  platforms: EnvironmentOption[];
  onBrowserChange: (value: string) => void;
  onPlatformChange: (value: string) => void;
}) {
  const [open, setOpen] = useState<"platform" | "browser" | null>(null);
  const platformLabel = useMemo(
    () => selectedLabel(platforms, platform),
    [platform, platforms],
  );
  const browserLabel = useMemo(
    () => selectedLabel(browsers, browser),
    [browser, browsers],
  );

  return (
    <Split role="group" aria-label="Visual baseline environment">
      <PopoverProvider
        ariaLabel="Choose baseline operating system"
        placement="top-start"
        padding={0}
        visible={open === "platform"}
        onVisibleChange={(visible) => setOpen(visible ? "platform" : null)}
        popover={() => (
          <EnvironmentMenu
            options={platforms}
            value={platform}
            onSelect={(value) => {
              onPlatformChange(value);
              setOpen(null);
            }}
          />
        )}
      >
        <Segment
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel="Visual baseline operating system"
          title={`Operating system: ${platformLabel}`}
        >
          <PlatformIcon platform={platform} />
          <TriggerLabel>{platformLabel}</TriggerLabel>
          <ChevronSmallDownIcon />
        </Segment>
      </PopoverProvider>
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
