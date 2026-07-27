import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithTheme } from "../test/render.js";
import {
  BaselineAlignmentWarning,
  BaselineGeometryWarning,
} from "./BaselineGeometryWarning.js";

afterEach(cleanup);

describe("BaselineGeometryWarning", () => {
  it("shows both capture sizes and the viewport as an alert", () => {
    renderWithTheme(
      <BaselineGeometryWarning
        mismatch={{
          baselineCss: { width: 1232, height: 187 },
          liveCss: { width: 264, height: 187 },
          captureViewport: { width: 1280, height: 900 },
        }}
      />,
    );

    expect(
      screen.getByRole("alert", { name: /Baseline geometry mismatch/ }),
    ).toHaveTextContent(
      "Baseline 1232×187 CSS px; live component 264×187 CSS px",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "1280×900 capture viewport",
    );
  });

  it("links an alignment mismatch to the story configuration", async () => {
    const user = userEvent.setup();
    let opened = false;
    renderWithTheme(
      <BaselineAlignmentWarning
        mismatch={{
          configured: "canvas",
          recommended: "viewport",
          baselineCss: { width: 1280, height: 900 },
          liveCss: { width: 180, height: 72 },
          captureViewport: { width: 1280, height: 900 },
          reason: "viewport-sized-baseline",
        }}
        onOpenConfiguration={() => {
          opened = true;
        }}
      />,
    );

    expect(
      screen.getByRole("alert", { name: /Baseline alignment mismatch/ }),
    ).toHaveTextContent(
      "1280×900 CSS px baseline is configured as Story canvas",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Review story alignment configuration",
      }),
    );
    expect(opened).toBe(true);
  });
});
