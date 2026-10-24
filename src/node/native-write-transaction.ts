import { assertCapturePathInside } from "./capture-path-safety.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VISUAL_DELTA_NATIVE_STAGE_ENV = "VISUAL_DELTA_NATIVE_STAGE";
export function nativeFileHash(file: string): string | null {
  return existsSync(file)
    ? createHash("sha256").update(readFileSync(file)).digest("hex")
    : null;
}
export function stagedNativeStoryPath(root: string, file: string): string {
  const stage = process.env[VISUAL_DELTA_NATIVE_STAGE_ENV];
  if (!stage) return file;
  assertCapturePathInside(root, file);
  const relative = path.relative(root, file);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).includes("..")
  )
    throw new Error("Native story mutation escaped the project root.");
  const destination = path.join(stage, "output", relative);
  const indexFile = path.join(stage, "originals.json");
  const originals = JSON.parse(readFileSync(indexFile, "utf8")) as Record<
    string,
    string | null
  >;
  if (!Object.hasOwn(originals, relative)) {
    originals[relative] = nativeFileHash(file);
    writeFileSync(indexFile, JSON.stringify(originals));
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  if (!existsSync(destination)) writeFileSync(destination, readFileSync(file));
  return destination;
}
