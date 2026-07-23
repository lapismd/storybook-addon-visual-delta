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

  it("preserves per-image capture metadata", () => {
    expect(
      normalizeImages([
        {
          src: "/lapis.png",
          deviceScaleFactor: 1,
          viewport: { width: 1440, height: 960 },
        },
      ]),
    ).toEqual([
      {
        src: "/lapis.png",
        anchor: undefined,
        offsetX: 0,
        offsetY: 0,
        align: "viewport",
        placement: "right",
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 960 },
      },
    ]);
  });
});
