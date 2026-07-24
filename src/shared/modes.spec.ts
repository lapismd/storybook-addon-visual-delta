import { describe, expect, it } from "vitest";
import {
  imagesFromModes,
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
      { light: { globals: { theme: "light" } }, dark: { globals: { theme: "dark" } } },
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
});
