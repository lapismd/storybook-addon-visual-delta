import { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { withVisualDeltaTheme } from "../stories/theme.js";

function Providers({ children }: { children: ReactNode }) {
  return withVisualDeltaTheme(children);
}

/** Render panel/manager React under Storybook's light theme. */
export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    ...options,
    wrapper: Providers,
  });
}
