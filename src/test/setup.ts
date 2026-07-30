import "@testing-library/jest-dom/vitest";

// Node 26 exposes an unavailable experimental global unless
// `--localstorage-file` is configured. Prefer jsdom's per-test storage.
function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  } satisfies Storage;
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: createMemoryStorage(),
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: createMemoryStorage(),
});

/**
 * jsdom does not implement canvas. Stub enough of 2d context for
 * `toOpaqueRgb` / `buildFocusAssets` in unit tests.
 */
function parseCssColor(cssColor: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(cssColor.trim());
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  const rgb =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(cssColor.trim()) ??
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(
      cssColor.trim(),
    );
  if (rgb) {
    const a = rgb[4] === undefined ? 255 : Math.round(Number(rgb[4]) * 255);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), a];
  }
  return [0, 0, 0, 0];
}

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value(this: HTMLCanvasElement, type: string) {
    if (type !== "2d") return null;
    let fillStyle = "#000000";
    return {
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = String(value);
      },
      fillRect() {
        /* no-op */
      },
      createImageData(width: number, height: number) {
        return {
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        };
      },
      putImageData() {
        /* no-op */
      },
      getImageData() {
        const [r, g, b, a] = parseCssColor(fillStyle);
        return { data: new Uint8ClampedArray([r, g, b, a]) };
      },
    };
  },
});

Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
  configurable: true,
  writable: true,
  value() {
    return "data:image/png;base64,test";
  },
});
