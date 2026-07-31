import React, { type CSSProperties, type ReactElement, type ReactNode } from "react";
import { EXAMPLE_SIZES } from "./example-sizes.js";

const shell: CSSProperties = {
  fontFamily:
    '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: "#2d3748",
  boxSizing: "border-box",
};

/**
 * Sole `#storybook-root` child for Examples. Fixed CSS size must match the
 * wired baseline CSS box (PNG natural size ÷ deviceScaleFactor, built-in 1).
 */
export function ExampleStage({
  width,
  height,
  children,
  intentionalLabel,
  background = "#f8f9fa",
}: {
  width: number;
  height: number;
  children: ReactNode;
  /** When set, paints a banner that is also present on intentional-demo baselines. */
  intentionalLabel?: string;
  background?: string;
}): ReactElement {
  return (
    <div
      data-testid="example-stage"
      data-intentional={intentionalLabel ? "true" : undefined}
      style={{
        ...shell,
        width,
        height,
        background,
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {intentionalLabel ? (
        <div
          role="note"
          style={{
            boxSizing: "border-box",
            height: 28,
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#7a2e2e",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.02,
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{intentionalLabel}</span>
        </div>
      ) : null}
      <div
        style={{
          boxSizing: "border-box",
          height: intentionalLabel ? height - 28 : height,
          padding: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DemoCard({
  title = "Project overview",
  drift = false,
}: {
  title?: string;
  drift?: boolean;
}): ReactElement {
  return (
    <div data-testid="examples-card" style={{ ...shell, height: "100%" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          overflow: "hidden",
          height: "100%",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: drift ? "#8b3a3a" : "#1e4078",
            color: "#fff",
            padding: "10px 14px",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {drift ? `${title} (changed)` : title}
        </div>
        <div style={{ padding: "12px 14px" }}>
          <div
            style={{
              height: 10,
              width: drift ? 140 : 180,
              background: drift ? "#a05050" : "#373f50",
              borderRadius: 2,
              marginBottom: 10,
            }}
          />
          <div
            style={{
              height: 8,
              width: drift ? 200 : 220,
              background: "#788291",
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function DemoGalleryCard({
  accent = "#2e7d32",
  compact = false,
  label = "Default gallery",
}: {
  accent?: string;
  compact?: boolean;
  label?: string;
}): ReactElement {
  return (
    <div
      data-testid="examples-gallery"
      style={{
        ...shell,
        display: "flex",
        background: "#fff",
        borderRadius: 6,
        overflow: "hidden",
        height: "100%",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ width: 8, flex: "0 0 8px", background: accent }} />
      <div
        style={{
          padding: compact ? "14px 16px" : "22px 16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            height: compact ? 12 : 14,
            width: compact ? 140 : 160,
            background: "#28323c",
            borderRadius: 2,
            marginBottom: 8,
          }}
        />
        <div style={{ fontSize: 12, color: "#788291" }}>{label}</div>
      </div>
    </div>
  );
}

export function DemoDisclosure({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <div data-testid="examples-disclosure" style={{ ...shell }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "#1e4078",
          color: "#fff",
          border: 0,
          borderRadius: 6,
          padding: "10px 18px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open ? (
        <div
          style={{
            marginTop: 12,
            background: "#fff",
            borderRadius: 6,
            padding: "14px 16px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            fontSize: 13,
            color: "#505a64",
          }}
        >
          Interaction baseline captures this opened state.
        </div>
      ) : null}
    </div>
  );
}

export function DemoModeBlock({
  compact = false,
}: {
  compact?: boolean;
}): ReactElement {
  return (
    <div
      data-testid="examples-modes"
      style={{
        ...shell,
        background: "#fff",
        borderRadius: 6,
        height: "100%",
        padding: compact ? "12px 16px" : "20px 16px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          height: compact ? 12 : 14,
          width: compact ? 100 : 120,
          background: "#28323c",
          borderRadius: 2,
        }}
      />
      <div style={{ marginTop: 8, fontSize: 12, color: "#788291" }}>
        {compact ? "Compact mode" : "Default mode"}
      </div>
    </div>
  );
}

export function DemoFilterChip(): ReactElement {
  return (
    <div
      data-testid="examples-filter-chip"
      style={{
        ...shell,
        height: "100%",
        display: "flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "#e6f0ff",
          color: "#1e4078",
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        status:open
      </span>
    </div>
  );
}

export function DemoAiReply(): ReactElement {
  return (
    <div
      data-testid="examples-ai-reply"
      style={{
        ...shell,
        background: "#f5f7fa",
        borderRadius: 8,
        height: "100%",
        padding: "20px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          height: 12,
          width: 200,
          background: "#3c4655",
          borderRadius: 2,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 10,
          width: 160,
          background: "#788291",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

export function DemoFormField(): ReactElement {
  return (
    <div
      data-testid="examples-form-field"
      style={{ ...shell, height: "100%", boxSizing: "border-box" }}
    >
      <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
        Due date
      </label>
      <div
        style={{
          border: "1px solid #c5ccd6",
          borderBottom: "2px solid #1e4078",
          borderRadius: 4,
          padding: "10px 12px",
          background: "#fff",
          color: "#788291",
          fontSize: 13,
        }}
      >
        31 Jul 2026
      </div>
    </div>
  );
}

export function DemoMissing(): ReactElement {
  return (
    <div
      data-testid="examples-missing"
      style={{
        ...shell,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        color: "#4a5568",
        fontSize: 13,
      }}
    >
      <span>
        Open the Visual Delta panel for empty-state copy. Nothing is broken —
        this story omits visualDelta.images on purpose.
      </span>
    </div>
  );
}

export { EXAMPLE_SIZES };
