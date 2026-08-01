import { describe, expect, it } from "vitest";
import {
  imagesFromModes,
  modeBaselineSrc,
  modeBaselineSlug,
  modeNames,
  stackModes,
} from "./modes.js";

describe("modeBaselineSlug", () => {
  it("slugifies mode names", () => {
    expect(modeBaselineSlug("Dark Desktop")).toBe("dark-desktop");
    expect(modeBaselineSlug("  light/mobile  ")).toBe("light-mobile");
  });
});

describe("stackModes", () => {
  it("merges levels and honors disable", () => {
    const stacked = stackModes(
      {
        light: { globals: { theme: "light" } },
        dark: { globals: { theme: "dark" } },
      },
      { dark: { disable: true }, desktop: { globals: { viewport: "large" } } },
    );
    expect(modeNames(stacked).sort()).toEqual(["desktop", "light"]);
    expect(stacked.light?.globals).toEqual({ theme: "light" });
  });
});

describe("imagesFromModes", () => {
  it("only includes modes with src", () => {
    const images = imagesFromModes({
      light: { src: "/a.png" },
      dark: { globals: { theme: "dark" } },
    });
    expect(images).toEqual([{ src: "/a.png", mode: "light" }]);
  });

  it("fills a missing src from the primary local baseline convention", () => {
    const images = imagesFromModes(
      {
        dark: { globals: { theme: "dark" } },
        explicit: { src: "/custom.png" },
      },
      {
        primarySrc: "/visual-baselines/button-chromium.png",
      },
    );
    expect(images).toEqual([
      {
        src: "/visual-baselines/button--dark-chromium.png",
        mode: "dark",
      },
      { src: "/custom.png", mode: "explicit" },
    ]);
  });
});

describe("modeBaselineSrc", () => {
  it("preserves query strings and leaves unsupported sources alone", () => {
    expect(
      modeBaselineSrc(
        "/visual-baselines/button-chromium.png?v=4",
        "Dark Desktop",
      ),
    ).toBe("/visual-baselines/button--dark-desktop-chromium.png?v=4");
    expect(
      modeBaselineSrc("data:image/png;base64,abc", "Dark"),
    ).toBeUndefined();
  });

  it("preserves Firefox and WebKit browser suffixes", () => {
    expect(
      modeBaselineSrc(
        "/visual-baselines/button-firefox.png",
        "Dark Desktop",
      ),
    ).toBe("/visual-baselines/button--dark-desktop-firefox.png");
    expect(
      modeBaselineSrc("/visual-baselines/button-webkit.png", "Dark"),
    ).toBe("/visual-baselines/button--dark-webkit.png");
  });
});
