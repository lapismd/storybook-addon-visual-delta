import React, { useState, type ReactNode } from "react";
import { AddonPanel, EmptyTabContent } from "storybook/internal/components";
import type { VisualDeltaHeader } from "./VisualDeltaHeader.js";
import {
  VisualDeltaHeader as Header,
  VisualDeltaHeaderView,
} from "./VisualDeltaHeader.js";
import { PanelStatusBar } from "./PanelStatusBar.js";
import {
  PanelBody,
  PanelScroll,
  PanelShell,
  SkeletonBone,
  SkeletonRoot,
  VD_HEADER_STICKY_TOP_VAR,
  VISUAL_DELTA_HEADER_HEIGHT,
} from "./styled.js";

export type PanelViewHeaderProps = Omit<
  React.ComponentProps<typeof VisualDeltaHeader>,
  "onHeightChange"
>;

export type PanelViewEmptyState = {
  title?: string;
  description: string;
  footer?: ReactNode;
};

export type PanelViewProps = {
  active?: boolean;
  header: PanelViewHeaderProps;
  loading?: boolean;
  configuration?: ReactNode;
  emptyState?: PanelViewEmptyState | null;
  content?: ReactNode;
  status: {
    running: boolean;
    label: string | null;
    log: string | null;
    error: string | null;
  };
  /** Stable hook for Storybook stories and manager-level Playwright tests. */
  testId?: string;
  /** Render the panel surface without manager-only AddonPanel context. */
  standalone?: boolean;
};

/**
 * Deterministic presentation surface shared by the real manager panel and the
 * catalog fixtures. Storybook APIs, channels, persistence, and HTTP calls stay
 * in the controller that supplies this view model.
 */
export function PanelView({
  active = false,
  header,
  loading = false,
  configuration,
  emptyState,
  content,
  status,
  testId = "visual-delta-panel",
  standalone = false,
}: PanelViewProps) {
  const [shellEl, setShellEl] = useState<HTMLDivElement | null>(null);
  const [headerStickyTop, setHeaderStickyTop] = useState(
    VISUAL_DELTA_HEADER_HEIGHT,
  );

  const surface = (
    <PanelShell ref={setShellEl} data-testid={testId}>
      <PanelScroll
        style={
          {
            [VD_HEADER_STICKY_TOP_VAR]: `${headerStickyTop}px`,
          } as React.CSSProperties
        }
      >
        {standalone ? (
          <VisualDeltaHeaderView
            {...header}
            onHeightChange={setHeaderStickyTop}
          />
        ) : (
          <Header {...header} onHeightChange={setHeaderStickyTop} />
        )}
        <PanelBody>
          {configuration}
          {!configuration && loading ? (
            <SkeletonRoot
              role="status"
              aria-busy="true"
              aria-label="Loading Visual Delta"
            >
              <SkeletonBone width="100%" height={180} radius={8} />
              <SkeletonBone width="40%" height={12} radius={4} />
            </SkeletonRoot>
          ) : null}
          {!configuration && !loading && emptyState ? (
            <EmptyTabContent
              title={emptyState.title ?? "Visual Delta"}
              description={emptyState.description}
              footer={emptyState.footer}
            />
          ) : null}
          {!configuration && !loading && !emptyState ? content : null}
        </PanelBody>
      </PanelScroll>
      <PanelStatusBar
        container={shellEl}
        running={status.running}
        label={status.label}
        log={status.log}
        error={status.error}
      />
    </PanelShell>
  );

  return standalone ? (
    surface
  ) : (
    <AddonPanel active={active}>{surface}</AddonPanel>
  );
}
