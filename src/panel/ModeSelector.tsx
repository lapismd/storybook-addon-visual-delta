import React, { useState } from "react";
import { CheckIcon, ChevronSmallDownIcon } from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
} from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { VisualModeResultStatus } from "../shared/mode-results.js";

const Wrap = styled.div({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto",
  fontSize: 11,
});

const Trigger = styled(Button)({
  minWidth: 112,
  justifyContent: "space-between",
  fontSize: 11,
});

const ModeRow = styled.span({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
});

const ModeThumbnail = styled.img(({ theme }) => ({
  width: 32,
  height: 22,
  flex: "0 0 32px",
  objectFit: "cover",
  objectPosition: "top left",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 3,
  background: theme.background.content,
}));

const StatusDot = styled.span<{ $status?: VisualModeResultStatus }>(
  ({ theme, $status }) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    background:
      $status === "passed"
        ? theme.color.positive
        : $status === "failed" || $status === "error"
          ? theme.color.negative
          : $status === "new"
            ? theme.color.warning
            : theme.appBorderColor,
  }),
);

const statusLabel = (status?: VisualModeResultStatus) =>
  status === "passed"
    ? "passed"
    : status === "failed"
      ? "failed"
      : status === "new"
        ? "new baseline"
        : status === "error"
          ? "capture error"
          : "not run";

export function ModeSelector({
  modeNames,
  value,
  onChange,
  disabled = false,
  results = {},
  previewSources = {},
}: {
  modeNames: string[];
  value: string | null;
  onChange: (mode: string | null) => void;
  disabled?: boolean;
  /** Result state keyed by `Default` or a configured mode name. */
  results?: Record<string, VisualModeResultStatus>;
  /** Resolved baseline thumbnails keyed by `Default` or mode name. */
  previewSources?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  if (modeNames.length === 0) return null;
  const current = value ?? "Default";
  const choices = ["Default", ...modeNames];
  return (
    <Wrap>
      <PopoverProvider
        ariaLabel="Choose visual mode"
        placement="bottom-start"
        padding={0}
        visible={open}
        onVisibleChange={setOpen}
        popover={() => (
          <div style={{ minWidth: 190 }}>
            <ActionList>
              {choices.map((name) => {
                const status = results[name];
                return (
                  <ActionList.Item key={name} active={current === name}>
                    <ActionList.Action
                      ariaLabel={`${name} mode, ${statusLabel(status)}`}
                      onClick={() => {
                        onChange(name === "Default" ? null : name);
                        setOpen(false);
                      }}
                    >
                      <ActionList.Icon>
                        {current === name ? <CheckIcon /> : <span />}
                      </ActionList.Icon>
                      <ActionList.Text>
                        <ModeRow>
                          {previewSources[name] ? (
                            <ModeThumbnail src={previewSources[name]} alt="" />
                          ) : null}
                          <StatusDot $status={status} aria-hidden="true" />
                          <span>{name}</span>
                          <span className="sb-unstyled">
                            {statusLabel(status)}
                          </span>
                        </ModeRow>
                      </ActionList.Text>
                    </ActionList.Action>
                  </ActionList.Item>
                );
              })}
            </ActionList>
          </div>
        )}
      >
        <Trigger
          size="small"
          variant="ghost"
          padding="small"
          disabled={disabled}
          ariaLabel={`Visual mode: ${current}, ${statusLabel(results[current])}`}
          title="Choose visual mode"
        >
          <ModeRow>
            {previewSources[current] ? (
              <ModeThumbnail src={previewSources[current]} alt="" />
            ) : null}
            <StatusDot $status={results[current]} aria-hidden="true" />
            <span>{current}</span>
          </ModeRow>
          <ChevronSmallDownIcon />
        </Trigger>
      </PopoverProvider>
    </Wrap>
  );
}
