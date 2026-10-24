import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { captureNamespace } from "./capture-configuration.js";

export function nativeCaptureFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink())
    throw new Error(`Native output contains a symbolic link: ${root}`);
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Native output contains a symbolic link: ${absolute}`);
    return entry.isDirectory()
      ? nativeCaptureFiles(absolute)
      : entry.isFile()
        ? [absolute]
        : [];
  });
}

/** Stage only the active profile's derived evidence; unsafe inputs are misses. */
export function stageNativeActualArtifacts(root: string, output: string): void {
  const namespace = captureNamespace(root);
  if (!namespace) return;
  const relative = path.join(".visual-delta/artifacts", namespace);
  const source = path.join(root, relative);
  const target = path.join(output, relative);
  copyEvidence(source, target);
}

function copyEvidence(source: string, target: string): void {
  try {
    const info = lstatSync(source);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const name of readdirSync(source))
        copyEvidence(path.join(source, name), path.join(target, name));
    } else if (info.isFile()) {
      // O_NOFOLLOW also rejects a file replaced with a link after lstat.
      const fd = openSync(
        source,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!fstatSync(fd).isFile()) return;
        const bytes = readFileSync(fd);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    // A missing/unsafe target must not discard another valid capture set.
    rmSync(target, { recursive: true, force: true });
  }
}
