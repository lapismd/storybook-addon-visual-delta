import React from "react";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { BaselineGeometryWarning } from "./BaselineGeometryWarning.js";

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
});
