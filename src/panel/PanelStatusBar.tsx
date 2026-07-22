import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { SyncIcon } from "@storybook/icons";
import { PopoverProvider } from "storybook/internal/components";
import {
  StatusBar,
  StatusLogPopover,
  StatusProgressButton,
  StatusProgressLabel,
  StatusSpinner,
} from "./styled.js";

/** Last non-empty line from a streamed log (for the clipped status label). */
export function lastMeaningfulLogLine(log: string): string {
  const lines = log.replace(/\r\n/g, "\n").split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return "";
}

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
};

type FixedPos = {
  right: number;
  bottom: number;
  width: number;
};

export const PanelStatusBar = memo(function PanelStatusBar({
  container,
  running,
  label,
  log,
  error,
}: PanelStatusBarProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FixedPos | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const hasLog = Boolean(log?.trim());
  const idle = !running && !hasLog;
  const clipped =
    (log ? lastMeaningfulLogLine(log) : "") ||
    label?.trim() ||
    (idle ? "Ready" : "Working…");
  const displayLog = log?.slice(-4000) ?? "";

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
        width: rect.width * 0.5,
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

  useEffect(() => {
    if (!open) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, displayLog]);

  if (!pos) return null;

  return (
    <StatusBar
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "auto",
        right: pos.right,
        bottom: pos.bottom,
        width: pos.width,
        maxWidth: pos.width,
      }}
    >
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
        popover={() => (
          <StatusLogPopover
            ref={logRef}
            $hasError={Boolean(error)}
            className="font-mono"
          >
            {displayLog}
          </StatusLogPopover>
        )}
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
        </StatusProgressButton>
      </PopoverProvider>
    </StatusBar>
  );
});
