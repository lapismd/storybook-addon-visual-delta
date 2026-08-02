import { describe, expect, it } from "vitest";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import {
  normalizeImages,
  normalizeImagesWithModes,
  resolveVisualDeltaImages,
} from "./normalize.js";

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

  it("applies an explicit demo environment to primary and mode images", () => {
    const environment = { browser: "chromium" as const, platform: "darwin" };
    expect(
      normalizeImagesWithModes({
        images: "/examples/default.png",
        modes: { Compact: { src: "/examples/compact.png" } },
        environment,
      }).map((image) => ({ src: image.src, environment: image.environment })),
    ).toEqual([
      { src: "/examples/default.png", environment },
      { src: "/examples/compact.png", environment },
    ]);
  });
});

describe("normalizeImagesWithModes", () => {
  it("appends mode src baselines with mode labels", () => {
    const images = normalizeImagesWithModes({
      images: "/primary.png",
      modes: {
        dark: { src: "/dark.png", globals: { theme: "dark" } },
        light: { globals: { theme: "light" } },
      },
      align: "canvas",
    });
    expect(images.map((img) => ({ src: img.src, mode: img.mode }))).toEqual([
      { src: "/primary.png", mode: undefined },
      { src: "/dark.png", mode: "dark" },
    ]);
  });
});

describe("resolveVisualDeltaImages", () => {
  it("retains image metadata and resolves story values over project defaults", () => {
    const result = resolveVisualDeltaImages(
      {
        images: [
          {
            src: "/baseline.png",
            viewport: { width: 1440, height: 960 },
            deviceScaleFactor: 2,
            align: "canvas",
            placement: "below",
          },
        ],
        modes: { Compact: { src: "/compact.png" } },
        environment: { browser: "chromium", platform: "darwin" },
        deviceScaleFactor: 3,
      },
      { ...BUILTIN_VISUAL_DELTA_DEFAULTS, placement: "left" },
    );

    expect(result.deviceScaleFactor).toBe(3);
    expect(result.images[0]).toMatchObject({
      src: "/baseline.png",
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 2,
      align: "canvas",
      placement: "below",
      environment: { browser: "chromium", platform: "darwin" },
    });
    expect(result.images[1]).toMatchObject({
      src: "/compact.png",
      mode: "Compact",
      deviceScaleFactor: 3,
      placement: "left",
      environment: { browser: "chromium", platform: "darwin" },
    });
  });
});
