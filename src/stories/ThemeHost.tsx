import React, { type ReactElement, type ReactNode } from "react";
import { withVisualDeltaTheme } from "./theme.js";

type ThemeHostProps = {
  children: ReactNode;
  testId?: string;
};

/** Storybook light-theme host with the same padding as the former Svelte wrapper. */
export function ThemeHost({
  children,
  testId = "react-theme-host",
}: ThemeHostProps): ReactElement {
  return withVisualDeltaTheme(
    <div
      data-testid={testId}
      style={{
        background: "#fff",
        padding: 12,
        minHeight: 48,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>,
  );
}
