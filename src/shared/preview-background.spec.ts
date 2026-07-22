import { describe, expect, it, vi } from "vitest";
import { toOpaqueRgb } from "./preview-background.js";

describe("toOpaqueRgb", () => {
  it("converts opaque CSS colors to rgb()", () => {
    let fillStyle = "";
    const getImageData = vi.fn(() => {
      const match =
        /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(fillStyle) ??
        /^#([0-9a-f]{6})$/i.exec(fillStyle);
      if (match?.[1] && match[2] && match[3] && !fillStyle.startsWith("#")) {
        return {
          data: new Uint8ClampedArray([
            Number(match[1]),
            Number(match[2]),
            Number(match[3]),
            255,
          ]),
        };
      }
      if (match?.[1] && fillStyle.startsWith("#")) {
        const n = Number.parseInt(match[1], 16);
        return {
          data: new Uint8ClampedArray([
            (n >> 16) & 255,
            (n >> 8) & 255,
            n & 255,
            255,
          ]),
        };
      }
      return { data: new Uint8ClampedArray([0, 0, 0, 0]) };
    });

    const doc = {
      createElement: () => ({
        width: 1,
        height: 1,
        getContext: () => ({
          get fillStyle() {
            return fillStyle;
          },
          set fillStyle(value: string) {
            fillStyle = value;
          },
          fillRect: vi.fn(),
          getImageData,
        }),
      }),
    } as unknown as Document;

    expect(toOpaqueRgb("rgb(10, 20, 30)", doc)).toBe("rgb(10, 20, 30)");
    expect(toOpaqueRgb("#ff0000", doc)).toBe("rgb(255, 0, 0)");
    expect(getImageData).toHaveBeenCalled();
  });

  it("falls back to white for fully transparent colors", () => {
    const doc = {
      createElement: () => ({
        width: 1,
        height: 1,
        getContext: () => ({
          fillStyle: "",
          fillRect: vi.fn(),
          getImageData: () => ({
            data: new Uint8ClampedArray([0, 0, 0, 0]),
          }),
        }),
      }),
    } as unknown as Document;
    expect(toOpaqueRgb("rgba(0, 0, 0, 0)", doc)).toBe("#ffffff");
  });

  it("falls back to white when canvas context is unavailable", () => {
    const doc = {
      createElement: () => ({
        width: 1,
        height: 1,
        getContext: () => null,
      }),
    } as unknown as Document;
    expect(toOpaqueRgb("rgb(1, 2, 3)", doc)).toBe("#ffffff");
  });
});
