import React, { type ReactElement, type ReactNode } from "react";
import { ThemeProvider, convert, themes } from "storybook/theming";

const lightTheme = convert(themes.light);

export function withVisualDeltaTheme(node: ReactNode): ReactElement {
  return <ThemeProvider theme={lightTheme}>{node}</ThemeProvider>;
}
