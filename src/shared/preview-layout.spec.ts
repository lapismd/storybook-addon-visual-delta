import { describe, expect, it } from "vitest";
import {
  backgroundCss,
  baselineOuterInsets,
  bodyOuterInsets,
  measurePreviewLayout,
  previewLayoutCacheKey,
  totalInsets,
  type PreviewLayoutSnapshot,
} from "./preview-layout.js";

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    width,
    height,
    toJSON: () => ({}),
  };
}

function installFixture(options?: {
  bodyStyle?: string;
  rootStyle?: string;
  subjectStyle?: string;
  layout?: "padded" | "centered" | "fullscreen";
}) {
  document.body.setAttribute("style", options?.bodyStyle ?? "");
  document.body.innerHTML = `<div id="storybook-root" style="${options?.rootStyle ?? ""}"><main style="${options?.subjectStyle ?? ""}">Story</main></div>`;
  const root = document.getElementById("storybook-root")!;
  const subject = root.firstElementChild!;
  Object.defineProperty(document.body, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(0, 0, 1280, 900),
  });
  Object.defineProperty(root, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(13, 17, 1230, 850),
  });
  Object.defineProperty(subject, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(36, 48, 400, 200),
  });
  return measurePreviewLayout(document, {
    storyId: "example--story",
    viewport: { width: 1280, height: 900 },
    layout: options?.layout ?? "padded",
  });
}

describe("PreviewLayoutSnapshot", () => {
  it("captures asymmetric body/root padding, borders, and subject margins", () => {
    const snapshot = installFixture({
      bodyStyle:
        "padding: 1px 2px 3px 4px; border-style: solid; border-width: 5px 6px 7px 8px",
      rootStyle:
        "padding: 9px 10px 11px 12px; border-style: solid; border-width: 13px 14px 15px 16px",
      subjectStyle: "margin: 17px 18px 19px 20px",
    });

    expect(snapshot.body.padding).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });
    expect(snapshot.root.border).toEqual({
      top: 13,
      right: 14,
      bottom: 15,
      left: 16,
    });
    expect(snapshot.subject?.margin).toEqual({
      top: 17,
      right: 18,
      bottom: 19,
      left: 20,
    });
    expect(
      baselineOuterInsets(snapshot, {
        align: "canvas",
        cropToViewport: false,
      }),
    ).toEqual({
      top: 45,
      right: 50,
      bottom: 55,
      left: 60,
    });
  });

  it("keeps zero-padding fullscreen roots at zero", () => {
    const snapshot = installFixture({ layout: "fullscreen" });
    expect(bodyOuterInsets(snapshot)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(
      baselineOuterInsets(snapshot, {
        align: "canvas",
        cropToViewport: false,
      }),
    ).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("ignores CSSOM widths for border sides that are not painted", () => {
    const snapshot = installFixture({
      bodyStyle: "border-style: none; border-width: 16px",
      rootStyle:
        "border-style: hidden solid none dotted; border-width: 16px 3px 20px 5px",
    });

    expect(snapshot.body.border).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(snapshot.root.border).toEqual({
      top: 0,
      right: 3,
      bottom: 0,
      left: 5,
    });
  });

  it("includes body-level padding for component captures", () => {
    const snapshot = installFixture({ bodyStyle: "padding: 7px 11px" });
    expect(
      baselineOuterInsets(snapshot, {
        align: "canvas",
        cropToViewport: false,
      }),
    ).toEqual({
      top: 7,
      right: 11,
      bottom: 7,
      left: 11,
    });
  });

  it("retains centered layout and measured box sizes", () => {
    const snapshot = installFixture({ layout: "centered" });
    expect(snapshot.layout).toBe("centered");
    expect(snapshot.root.rect).toMatchObject({
      x: 13,
      y: 17,
      width: 1230,
      height: 850,
    });
    expect(snapshot.subject?.rect).toMatchObject({
      x: 36,
      y: 48,
      width: 400,
      height: 200,
    });
  });

  it("does not reconstruct layout for viewport captures", () => {
    const snapshot = installFixture({
      bodyStyle: "padding: 8px",
      rootStyle: "padding: 16px",
      subjectStyle: "margin: 4px",
    });
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    expect(
      baselineOuterInsets(snapshot, {
        align: "viewport",
        cropToViewport: false,
      }),
    ).toEqual(zero);
    expect(
      baselineOuterInsets(snapshot, {
        align: "canvas",
        cropToViewport: true,
      }),
    ).toEqual(zero);
  });

  it("preserves transparent backgrounds", () => {
    const snapshot = installFixture({
      bodyStyle: "background-color: transparent",
      rootStyle: "background-color: rgba(0, 0, 0, 0)",
    });
    expect(snapshot.body.background.color).toBe("rgba(0, 0, 0, 0)");
    expect(snapshot.root.background.color).toBe("rgba(0, 0, 0, 0)");
    expect(backgroundCss(snapshot.root.background)).toContain(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("keys different baseline viewports and render generations separately", () => {
    expect(
      previewLayoutCacheKey({
        storyId: "example--story",
        renderGeneration: 2,
        viewport: { width: 1280, height: 900 },
      }),
    ).not.toBe(
      previewLayoutCacheKey({
        storyId: "example--story",
        renderGeneration: 2,
        viewport: { width: 1440, height: 960 },
      }),
    );
    expect(
      previewLayoutCacheKey({
        storyId: "example--story",
        renderGeneration: 2,
        viewport: { width: 1280, height: 900 },
      }),
    ).not.toBe(
      previewLayoutCacheKey({
        storyId: "example--story",
        renderGeneration: 3,
        viewport: { width: 1280, height: 900 },
      }),
    );
  });

  it("totals measured sides without adding defaults", () => {
    const snapshot = installFixture({ rootStyle: "padding: 2px 5px" });
    const insets = baselineOuterInsets(snapshot, {
      align: "canvas",
      cropToViewport: false,
    });
    expect(totalInsets(insets)).toEqual({ x: 10, y: 4 });
  });
});
