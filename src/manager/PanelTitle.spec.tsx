import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { PanelTitle } from "./PanelTitle.js";
import { renderWithTheme } from "../test/render.js";

const getSelectedPanel = vi.fn(() => "visual-delta/panel");
const useAddonState = vi.fn((_id?: string, _defaultState?: unknown) => [
  { imageCount: 3 },
  vi.fn(),
]);

vi.mock("storybook/manager-api", () => ({
  useStorybookApi: () => ({ getSelectedPanel }),
  useAddonState: (id: string, defaultState?: unknown) =>
    useAddonState(id, defaultState),
}));

vi.mock("storybook/internal/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("storybook/internal/components")>();
  return {
    ...actual,
    Badge: ({ children }: { children: React.ReactNode }) => (
      <span data-testid="panel-count-badge">{children}</span>
    ),
  };
});

describe("PanelTitle", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getSelectedPanel.mockReturnValue("visual-delta/panel");
    useAddonState.mockReturnValue([{ imageCount: 3 }, vi.fn()]);
  });

  it("shows Visual Delta with a count badge when images exist", () => {
    renderWithTheme(<PanelTitle />);
    expect(screen.getByText("Visual Delta")).toBeInTheDocument();
    expect(screen.getByTestId("panel-count-badge")).toHaveTextContent("3");
  });

  it("hides the badge when count is zero", () => {
    useAddonState.mockReturnValue([{ imageCount: 0 }, vi.fn()]);
    renderWithTheme(<PanelTitle />);
    expect(screen.getByText("Visual Delta")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-count-badge")).not.toBeInTheDocument();
  });
});
