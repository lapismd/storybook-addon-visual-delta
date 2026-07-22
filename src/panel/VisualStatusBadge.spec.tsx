import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { VisualStatusBadge } from "./VisualStatusBadge.js";
import { renderWithTheme } from "../test/render.js";

vi.mock("storybook/internal/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("storybook/internal/components")>();
  return {
    ...actual,
    WithTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipNote: () => null,
  };
});

describe("VisualStatusBadge", () => {
  it("renders pass status", () => {
    renderWithTheme(<VisualStatusBadge status="pass" />);
    expect(screen.getByLabelText("Visual status: Pass")).toBeInTheDocument();
  });

  it("renders fail status", () => {
    renderWithTheme(<VisualStatusBadge status="fail" />);
    expect(screen.getByLabelText("Visual status: Fail")).toBeInTheDocument();
  });
});
