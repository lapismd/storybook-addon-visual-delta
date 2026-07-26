import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PLAYWRIGHT_PASS_THRESHOLD_PERCENT } from "../visual-diff-sidecar.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

/** Host file for package-wide Playwright pass threshold (% of pixels). */
export const PLAYWRIGHT_THRESHOLD_REL = ".visual-delta/playwright.json";

export type PlaywrightThresholdFile = {
  passThresholdPercent: number;
};

export function playwrightThresholdPath(root: string): string {
  return join(root, PLAYWRIGHT_THRESHOLD_REL);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return PLAYWRIGHT_PASS_THRESHOLD_PERCENT;
  return Math.min(100, Math.max(0, value));
}

/** Read host Playwright pass threshold (%), falling back to the package default. */
export function readPlaywrightPassThresholdPercent(root: string): number {
  const path = playwrightThresholdPath(root);
  if (!existsSync(path)) return PLAYWRIGHT_PASS_THRESHOLD_PERCENT;
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<PlaywrightThresholdFile>;
    if (
      typeof parsed.passThresholdPercent === "number" &&
      Number.isFinite(parsed.passThresholdPercent)
    ) {
      return clampPercent(parsed.passThresholdPercent);
    }
  } catch {
    /* corrupt / unreadable */
  }
  return PLAYWRIGHT_PASS_THRESHOLD_PERCENT;
}

/** Persist host Playwright pass threshold (% of pixels). */
export function writePlaywrightPassThresholdPercent(
  root: string,
  passThresholdPercent: number,
): PlaywrightThresholdFile {
  const next: PlaywrightThresholdFile = {
    passThresholdPercent: clampPercent(passThresholdPercent),
  };
  const path = playwrightThresholdPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/**
 * Resolve pass threshold for Playwright config helpers.
 * Prefers `cwd` host file, then `VISUAL_DELTA_PASS_THRESHOLD_PERCENT`, then default.
 */
export function resolvePlaywrightPassThresholdPercent(
  root = process.cwd(),
): number {
  const fromEnv = process.env.VISUAL_DELTA_PASS_THRESHOLD_PERCENT;
  if (fromEnv != null && fromEnv.trim() !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n)) return clampPercent(n);
  }
  return readVisualDeltaProjectConfig(root).defaults.passThresholdPercent;
}
