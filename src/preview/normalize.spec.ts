import { describe, expect, it } from "vitest";
import { normalizeImages } from "./normalize.js";

describe("normalizeImages", () => {
  it("normalizes a single string src with globals", () => {
    expect(
      normalizeImages("/a.png", "#root", 2, 3, "canvas", "beside"),
    ).toEqual([
      {
        src: "/a.png",
        anchor: "#root",
        offsetX: 2,
        offsetY: 3,
        align: "canvas",
        placement: "right",
      },
    ]);
  });

  it("merges object entries over globals and maps legacy over", () => {
    expect(
      normalizeImages(
        [
          { src: "/a.png", offsetX: 9, placement: "over" },
          { src: "/b.png", align: "viewport" },
        ],
        undefined,
        1,
        2,
        "canvas",
        "left",
      ),
    ).toEqual([
      {
        src: "/a.png",
        anchor: undefined,
        offsetX: 9,
        offsetY: 2,
        align: "canvas",
        placement: "center",
      },
      {
        src: "/b.png",
        anchor: undefined,
        offsetX: 1,
        offsetY: 2,
        align: "viewport",
        placement: "left",
      },
    ]);
  });
});
