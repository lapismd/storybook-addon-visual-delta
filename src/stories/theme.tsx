import React, { type ReactElement, type ReactNode } from "react";
import {
  Global,
  ThemeProvider,
  convert,
  createReset,
  themes,
} from "storybook/theming";

const lightTheme = convert(themes.light);
const resetStyles = createReset({ typography: lightTheme.typography });

/**
 * Storybook manager chrome fonts (Nunito Sans via createReset).
 * ThemeProvider alone does not inject Global styles — without createReset the
 * preview iframe falls back to the browser default (Times).
 */
export function withVisualDeltaTheme(node: ReactNode): ReactElement {
  return (
    <ThemeProvider theme={lightTheme}>
      <Global styles={resetStyles} />
      {node}
    </ThemeProvider>
  );
}
