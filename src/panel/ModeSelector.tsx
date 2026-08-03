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
  flex: "0 0 auto",
  fontSize: 11,
});

const Split = styled.div(({ theme }) => ({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "stretch",
  flex: "0 0 auto",
  width: 78,
  height: 78,
  boxSizing: "border-box",
  overflow: "hidden",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  background: theme.background.content,
}));

const PreviewButton = styled.button<{ $hasSelector: boolean }>(
  ({ theme, $hasSelector }) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: $hasSelector ? 52 : 76,
    flex: `0 0 ${$hasSelector ? 52 : 76}px`,
    padding: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    border: "none",
    borderRadius: 0,
    background: theme.background.app,
    cursor: "zoom-in",
    "&:disabled": {
      cursor: "default",
    },
    "&:focus-visible": {
      position: "relative",
      zIndex: 1,
      outline: `2px solid ${theme.color.secondary}`,
      outlineOffset: -2,
    },
  }),
);

const PreviewImage = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  objectPosition: "center",
});

const Trigger = styled(Button)(({ theme }) => ({
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  height: 24,
  minHeight: 24,
  padding: "0 4px",
  boxSizing: "border-box",
  justifyContent: "space-between",
  gap: 2,
  border: "none",
  borderTop: `1px solid ${theme.appBorderColor}`,
  borderRadius: 0,
  boxShadow: "none",
  fontSize: 11,
  "& svg": {
    width: 12,
    height: 12,
    flexShrink: 0,
  },
}));

const TriggerModeRow = styled.span({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  overflow: "hidden",
});

const TriggerModeName = styled.span({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const ModeRow = styled.span({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
});

const MenuThumbnailFrame = styled.span(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 72,
  height: 44,
  flex: "0 0 72px",
  overflow: "hidden",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  background: theme.background.app,
}));

const MenuThumbnail = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  objectPosition: "center",
});

const MissingThumbnail = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 9,
  lineHeight: 1.1,
  textAlign: "center",
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
  onPreviewOpen,
}: {
  modeNames: string[];
  value: string | null;
  onChange: (mode: string | null) => void;
  disabled?: boolean;
  /** Result state keyed by `Default` or a configured mode name. */
  results?: Record<string, VisualModeResultStatus>;
  /** Resolved baseline thumbnails keyed by `Default` or mode name. */
  previewSources?: Record<string, string>;
  /** Opens the active resolved baseline in the shared image lightbox. */
  onPreviewOpen?: (preview: {
    name: string;
    src: string;
    image: HTMLImageElement | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value ?? "Default";
  const choices = ["Default", ...modeNames];
  const currentSource = previewSources[current];
  if (modeNames.length === 0 && !currentSource) return null;
  const hasSelector = choices.length > 1;
  return (
    <Wrap>
      <Split role="group" aria-label="Visual mode and baseline preview">
        <PreviewButton
          type="button"
          $hasSelector={hasSelector}
          disabled={!currentSource || !onPreviewOpen}
          aria-label={
            currentSource
              ? `Open ${current} baseline full image`
              : `No ${current} baseline image`
          }
          title={
            currentSource
              ? `Open ${current} baseline full image`
              : `No ${current} baseline image`
          }
          onClick={(event) => {
            if (!currentSource) return;
            onPreviewOpen?.({
              name: current,
              src: currentSource,
              image: event.currentTarget.querySelector("img"),
            });
          }}
        >
          {currentSource ? (
            <PreviewImage src={currentSource} alt="" />
          ) : (
            <MissingThumbnail>No image</MissingThumbnail>
          )}
        </PreviewButton>
        {hasSelector ? (
          <PopoverProvider
            ariaLabel="Choose visual mode"
            placement="bottom-start"
            padding={0}
            visible={open}
            onVisibleChange={setOpen}
            popover={() => (
              <div style={{ minWidth: 250 }}>
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
                              <MenuThumbnailFrame>
                                {previewSources[name] ? (
                                  <MenuThumbnail
                                    src={previewSources[name]}
                                    alt=""
                                  />
                                ) : (
                                  <MissingThumbnail>No image</MissingThumbnail>
                                )}
                              </MenuThumbnailFrame>
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
              <TriggerModeRow>
                <StatusDot $status={results[current]} aria-hidden="true" />
                <TriggerModeName>{current}</TriggerModeName>
              </TriggerModeRow>
              <ChevronSmallDownIcon />
            </Trigger>
          </PopoverProvider>
        ) : null}
      </Split>
    </Wrap>
  );
}
