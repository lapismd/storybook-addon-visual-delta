import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { VisualStatusBadge } from "./VisualStatusBadge.js";
import { renderWithTheme } from "../test/render.js";

describe("VisualStatusBadge", () => {
  it("renders pass status", () => {
    renderWithTheme(<VisualStatusBadge status="pass" />);
    expect(
      screen.getByLabelText(/Visual status: Pass/),
    ).toBeInTheDocument();
  });

  it("renders fail status", () => {
    renderWithTheme(<VisualStatusBadge status="fail" />);
    expect(
      screen.getByLabelText(/Visual status: Fail/),
    ).toBeInTheDocument();
  });
});
