import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { captureCacheDir, captureNamespace } from "./capture-configuration.js";

/** Builders emit a shared graph; each completed profile build owns its copy. */
export function publishProfilePreviewGraph(root: string): void {
  if (!captureNamespace(root)) return;
  const source = path.join(root, ".visual-delta/cache/preview-stats.json");
  const destination = path.join(captureCacheDir(root), "preview-stats.json");
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
