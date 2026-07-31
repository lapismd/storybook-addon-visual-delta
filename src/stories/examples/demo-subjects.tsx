import React, { type CSSProperties, type ReactElement, type ReactNode } from "react";

const shell: CSSProperties = {
  fontFamily:
    '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: "#2d3748",
  boxSizing: "border-box",
};

export function DemoCard({
  title = "Project overview",
  body = "Track visual baselines and review diffs in one place.",
  drift = false,
}: {
  title?: string;
  body?: string;
  drift?: boolean;
}): ReactElement {
  return (
    <div
      data-testid="examples-card"
      style={{
        ...shell,
        width: 320,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            background: drift ? "#8b3a3a" : "#1e4078",
            color: "#fff",
            padding: "10px 16px",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {drift ? `${title} (changed)` : title}
        </div>
        <div style={{ padding: "16px" }}>
          <div
            style={{
              height: 12,
              width: 180,
              background: "#373f50",
              borderRadius: 2,
              marginBottom: 12,
            }}
          />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: "#788291" }}>
            {drift ? "Spacing and accent intentionally differ from the baseline." : body}
          </p>
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
        width: 280,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          background: "#fff",
          borderRadius: 6,
          overflow: "hidden",
          minHeight: compact ? 64 : 96,
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ width: 8, background: accent }} />
        <div style={{ padding: compact ? "16px 20px" : "24px 20px" }}>
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
    <div
      data-testid="examples-disclosure"
      style={{ ...shell, width: 300, padding: 20 }}
    >
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
            padding: "16px 20px",
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
      style={{ ...shell, width: 260, padding: compact ? 12 : 16 }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 6,
          padding: compact ? "12px 16px" : "20px 16px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
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
    </div>
  );
}

export function DemoFilterChip(): ReactElement {
  return (
    <div data-testid="examples-filter-chip" style={{ ...shell, padding: 16 }}>
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
      style={{ ...shell, width: 320, padding: 16 }}
    >
      <div
        style={{
          background: "#f5f7fa",
          borderRadius: 8,
          padding: "20px 16px",
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
    </div>
  );
}

export function DemoFormField(): ReactElement {
  return (
    <div
      data-testid="examples-form-field"
      style={{ ...shell, width: 280, padding: 16 }}
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
      style={{ ...shell, padding: 24, color: "#788291", fontSize: 14 }}
    >
      This story has no wired baseline — useful for empty-state copy.
    </div>
  );
}

export function DemoFrame({ children }: { children: ReactNode }): ReactElement {
  return (
    <div style={{ background: "#f8f9fa", minHeight: 48, padding: 8 }}>
      {children}
    </div>
  );
}
