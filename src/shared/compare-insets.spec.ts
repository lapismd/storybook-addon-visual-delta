import { describe, expect, it } from "vitest";
import {
  baselinePanePaddingPx,
  canvasCompareInsetsPx,
  subjectOffsetInCanvasPx,
} from "./compare-insets.js";

describe("baselinePanePaddingPx", () => {
  it("adds subject margins to canvas padding", () => {
    expect(
      baselinePanePaddingPx(
        {
          paddingTop: "24px",
          paddingRight: "24px",
          paddingBottom: "24px",
          paddingLeft: "24px",
        },
        {
          marginTop: "8px",
          marginRight: "0px",
          marginBottom: "8px",
          marginLeft: "0px",
        },
      ),
    ).toEqual({ top: 32, right: 24, bottom: 32, left: 24 });
  });

  it("treats missing subject style as zero margins", () => {
    expect(
      baselinePanePaddingPx({
        paddingTop: "16px",
        paddingRight: "16px",
        paddingBottom: "16px",
        paddingLeft: "16px",
      }),
    ).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
  });
});

describe("canvasCompareInsetsPx", () => {
  it("sums padding, border, and subject margins per axis", () => {
    expect(
      canvasCompareInsetsPx(
        {
          paddingTop: "10px",
          paddingBottom: "10px",
          paddingLeft: "4px",
          paddingRight: "6px",
          borderTopWidth: "1px",
          borderBottomWidth: "1px",
          borderLeftWidth: "2px",
          borderRightWidth: "2px",
        },
        {
          marginTop: "8px",
          marginBottom: "8px",
          marginLeft: "3px",
          marginRight: "1px",
        },
      ),
    ).toEqual({ x: 18, y: 38 });
  });
});

describe("subjectOffsetInCanvasPx", () => {
  it("reads subject margin as offset from padding edge", () => {
    expect(
      subjectOffsetInCanvasPx({ marginLeft: "12px", marginTop: "4px" }),
    ).toEqual({ x: 12, y: 4 });
    expect(subjectOffsetInCanvasPx(null)).toEqual({ x: 0, y: 0 });
  });
});
