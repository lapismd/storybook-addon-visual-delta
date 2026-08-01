import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CheckIcon, CopyIcon, SyncIcon } from "@storybook/icons";
import {
  PopoverProvider,
  ScrollArea,
  useCopyButton,
} from "storybook/internal/components";
import { lastMeaningfulLogLine } from "../shared/status-log.js";
import { EnvironmentSplitButton } from "./EnvironmentSplitButton.js";
import {
  StatusBar,
  StatusLogBody,
  StatusLogCopyButton,
  StatusLogShell,
  StatusProgressButton,
  StatusProgressFill,
  StatusProgressLabel,
  StatusProgressTrack,
  StatusProgressValue,
  StatusSpinner,
} from "./styled.js";

export { lastMeaningfulLogLine };

/** Nearest ancestor that actually scrolls (Storybook AddonPanel scroller). */
function findScrollPort(start: HTMLElement | null): HTMLElement | null {
  let el = start?.parentElement ?? null;
  while (el) {
    const { overflowY, overflow } = getComputedStyle(el);
    const y = overflowY || overflow;
    if (
      (y === "auto" || y === "scroll" || y === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    // Prefer a sized overflow scroller even before content overflows.
    if (
      (y === "auto" || y === "scroll" || y === "overlay") &&
      el.clientHeight > 0
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return start;
}

export type PanelStatusBarProps = {
  /** Panel shell — used to discover the AddonPanel scrollport to pin against. */
  container: HTMLElement | null;
  /** True while create/update/interaction/visual-run is in flight (not live Diff). */
  running: boolean;
  /** Fallback label when no log line is available (e.g. Creating… / Testing... N/M). */
  label?: string | null;
  /** Full log text for the popover; clipped last line shows on the button. */
  log?: string | null;
  /** When set, button + popover use error coloring. */
  error?: string | null;
  /** Live completed/total counts. Missing or zero totals render indeterminate. */
  progress?: {
    completed: number;
    total: number;
  } | null;
  environment?: {
    browser: string;
    browsers: Array<{ value: string; label: string }>;
    onBrowserChange: (value: string) => void;
    captureProfileId?: string;
  };
};

type FixedPos = {
  right: number;
  bottom: number;
  width: number;
};

const StatusLogPopoverContent = memo(function StatusLogPopoverContent({
  log,
  hasError,
}: {
  log: string;
  hasError: boolean;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const { children: copyChildren, buttonProps } = useCopyButton({
    content: log,
    children: <CopyIcon />,
    childrenOnCopy: <CheckIcon />,
    ariaLabel: "Copy log",
    ariaLabelOnCopy: "Copied",
    duration: 1500,
  });
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <StatusLogShell $hasError={hasError}>
      {/* Button tooltips from ariaLabel — do not wrap WithTooltip. */}
      <StatusLogCopyButton
        size="small"
        variant="ghost"
        padding="small"
        ariaLabel={buttonProps.ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          buttonProps.onClick(event);
        }}
      >
        {copyChildren}
      </StatusLogCopyButton>
      <div style={{ height: "100%" }}>
        <ScrollArea ref={logRef} vertical>
          <StatusLogBody>{log}</StatusLogBody>
        </ScrollArea>
      </div>
    </StatusLogShell>
  );
});

export const PanelStatusBar = memo(function PanelStatusBar({
  container,
  running,
  label,
  log,
  error,
  progress,
  environment,
}: PanelStatusBarProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FixedPos | null>(null);
  const hasLog = Boolean(log?.trim());
  const idle = !running && !hasLog;
  const clipped =
    (log ? lastMeaningfulLogLine(log) : "") ||
    label?.trim() ||
    (idle ? "Ready" : "Working…");
  const displayLog = log?.slice(-4000) ?? "";
  const determinate = Boolean(progress && progress.total > 0);
  const completed = Math.max(0, progress?.completed ?? 0);
  const total = Math.max(0, progress?.total ?? 0);
  const percent = determinate
    ? Math.min(100, Math.max(0, (completed / total) * 100))
    : 0;

  useLayoutEffect(() => {
    if (!container) {
      setPos(null);
      return;
    }

    const scrollPort = findScrollPort(container) ?? container;

    const update = () => {
      // Pin to the *visible* panel viewport, not the tall scrolled content box.
      const rect = scrollPort.getBoundingClientRect();
      setPos({
        right: Math.max(0, window.innerWidth - rect.right),
        bottom: Math.max(0, window.innerHeight - rect.bottom),
        width: rect.width,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(scrollPort);
    if (scrollPort !== container) ro.observe(container);
    window.addEventListener("resize", update);
    // Capture nested Storybook dock / panel scrolls.
    window.addEventListener("scroll", update, true);
    scrollPort.addEventListener("scroll", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      scrollPort.removeEventListener("scroll", update);
    };
  }, [container]);

  if (!pos) return null;

  return (
    <StatusBar
      $running={running}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "auto",
        right: pos.right,
        bottom: pos.bottom,
        width: pos.width,
        maxWidth: pos.width,
        pointerEvents: running || hasLog || environment ? "auto" : "none",
      }}
    >
      {running ? (
        <StatusProgressTrack
          role="progressbar"
          aria-label="Visual Delta check progress"
          aria-valuemin={0}
          aria-valuemax={determinate ? total : undefined}
          aria-valuenow={determinate ? Math.min(completed, total) : undefined}
          aria-valuetext={
            determinate
              ? `${Math.min(completed, total)} of ${total} checks complete`
              : clipped
          }
        >
          <StatusProgressFill
            $indeterminate={!determinate}
            $percent={percent}
          />
        </StatusProgressTrack>
      ) : null}
      {environment ? <EnvironmentSplitButton {...environment} /> : null}
      <PopoverProvider
        ariaLabel="Visual Delta progress log"
        placement="top-start"
        padding={0}
        visible={open && hasLog}
        onVisibleChange={(next) => {
          if (!hasLog) {
            setOpen(false);
            return;
          }
          setOpen(next);
        }}
        popover={() =>
          hasLog ? (
            <StatusLogPopoverContent
              log={displayLog}
              hasError={Boolean(error)}
            />
          ) : null
        }
      >
        <StatusProgressButton
          type="button"
          disabled={idle}
          $idle={idle}
          $hasError={Boolean(error)}
          title={hasLog ? "Show full progress log" : clipped}
          aria-label={
            running
              ? `Progress: ${clipped}`
              : hasLog
                ? `Log: ${clipped}`
                : "Ready"
          }
        >
          {running ? (
            <StatusSpinner aria-hidden>
              <SyncIcon />
            </StatusSpinner>
          ) : null}
          <StatusProgressLabel>{clipped}</StatusProgressLabel>
          {running && determinate ? (
            <StatusProgressValue aria-hidden>
              {Math.min(completed, total)}/{total}
            </StatusProgressValue>
          ) : null}
        </StatusProgressButton>
      </PopoverProvider>
    </StatusBar>
  );
});
