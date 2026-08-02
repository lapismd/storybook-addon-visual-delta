import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DIFF_THRESHOLD } from "../constants.js";
import { compareBaselineToActualPng } from "./compare-pixels.js";

const pixelmatch = vi.hoisted(() => vi.fn(() => 0));

vi.mock("pixelmatch", () => ({ default: pixelmatch }));

const temporaryDirectories: string[] = [];

function png(red: number, green: number, blue: number): Buffer {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([red, green, blue, 255]);
  return PNG.sync.write(image);
}

afterEach(() => {
  pixelmatch.mockClear();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("compareBaselineToActualPng", () => {
  it("uses the shared default per-pixel color threshold", () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-delta-pixels-"));
    temporaryDirectories.push(directory);
    const baselinePath = join(directory, "baseline.png");
    writeFileSync(baselinePath, png(255, 255, 255));

    const result = compareBaselineToActualPng(
      baselinePath,
      png(240, 240, 240),
    );

    expect(pixelmatch).toHaveBeenCalledOnce();
    expect(pixelmatch.mock.calls[0]?.[5]).toMatchObject({
      threshold: DEFAULT_DIFF_THRESHOLD,
    });
    expect(DEFAULT_DIFF_THRESHOLD).toBe(0.063);
    expect(result.passThresholdPercent).toBe(0.063);
  });
});
