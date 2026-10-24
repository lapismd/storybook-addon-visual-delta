import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Persist only into the native transaction, independently of host snapshots. */
export function writeNativeBaselineIfApproved(
  baselinePath: string,
  actual: Buffer | null | undefined,
  status: string,
): void {
  if (
    !process.env.VISUAL_DELTA_NATIVE_STAGE ||
    process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS !== "1"
  )
    return;
  if (process.env.VISUAL_UPDATE_APPROVED !== "1")
    throw new Error(
      "Native baseline capture requires explicit write approval.",
    );
  const root = process.env.VISUAL_DELTA_STAGED_SNAPSHOT_DIR;
  const relative = root ? path.relative(root, baselinePath) : "..";
  if (
    !root ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).includes("..")
  )
    throw new Error(
      "Native baseline write escaped its staged snapshot directory.",
    );
  if (!actual || status !== "passed") return;
  if (
    process.env.PLAYWRIGHT_UPDATE_MODE === "missing" &&
    existsSync(baselinePath)
  )
    return;
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, actual);
}
