import React from "react";

/** Minimal painted subject for manager/overlay acceptance story IDs. */
export function StubSubject({
  label,
  width = 240,
  height = 64,
}: {
  label: string;
  width?: number;
  height?: number;
}) {
  return (
    <div
      data-testid="host-product-stub"
      style={{
        boxSizing: "border-box",
        width,
        height,
        display: "grid",
        placeItems: "center",
        border: "2px solid #2563eb",
        borderRadius: 8,
        background: "#eff6ff",
        color: "#1e3a8a",
        font: "600 16px/1.2 system-ui, sans-serif",
      }}
    >
      {label}
    </div>
  );
}
