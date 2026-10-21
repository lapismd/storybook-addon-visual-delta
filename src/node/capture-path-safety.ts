import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/** Resolve existing symlink ancestors, including for a not-yet-created file. */
function physicalPath(candidate: string): string {
  let current = path.resolve(candidate);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current)
      throw new Error(`Capture path has no existing ancestor: ${candidate}`);
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(realpathSync(current), ...suffix);
}
export function isCapturePathInside(root: string, candidate: string): boolean {
  const relative = path.relative(physicalPath(root), physicalPath(candidate));
  return !path.isAbsolute(relative) && !relative.split(path.sep).includes("..");
}
export function assertCapturePathInside(root: string, candidate: string): void {
  if (!isCapturePathInside(root, candidate))
    throw new Error(
      `Capture path escapes its approved root through a symbolic link: ${candidate}`,
    );
}
