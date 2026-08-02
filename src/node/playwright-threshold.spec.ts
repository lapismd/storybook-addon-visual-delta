import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PLAYWRIGHT_PASS_THRESHOLD_PERCENT } from "../visual-diff-sidecar.js";
import {
  PLAYWRIGHT_THRESHOLD_REL,
  readPlaywrightPassThresholdPercent,
  writePlaywrightPassThresholdPercent,
} from "./playwright-threshold.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("playwright threshold host file", () => {
  it("defaults when missing", () => {
    const root = mkdtempSync(join(tmpdir(), "vd-pw-"));
    dirs.push(root);
    expect(readPlaywrightPassThresholdPercent(root)).toBe(
      PLAYWRIGHT_PASS_THRESHOLD_PERCENT,
    );
    expect(PLAYWRIGHT_PASS_THRESHOLD_PERCENT).toBe(0.063);
  });

  it("round-trips a written percent", () => {
    const root = mkdtempSync(join(tmpdir(), "vd-pw-"));
    dirs.push(root);
    writePlaywrightPassThresholdPercent(root, 0.25);
    expect(readPlaywrightPassThresholdPercent(root)).toBe(0.25);
    const raw = JSON.parse(
      readFileSync(join(root, PLAYWRIGHT_THRESHOLD_REL), "utf8"),
    ) as { passThresholdPercent: number };
    expect(raw.passThresholdPercent).toBe(0.25);
  });

  it("clamps out-of-range values", () => {
    const root = mkdtempSync(join(tmpdir(), "vd-pw-"));
    dirs.push(root);
    expect(
      writePlaywrightPassThresholdPercent(root, -1).passThresholdPercent,
    ).toBe(0);
    expect(
      writePlaywrightPassThresholdPercent(root, 150).passThresholdPercent,
    ).toBe(100);
  });
});
