import { fileURLToPath } from "node:url";

/**
 * Load this package's addon from source (manager + preview once).
 * Same pattern as the UI host `.storybook/visual-delta-preset.ts`.
 */
const addonSrc = (entry: string) =>
  fileURLToPath(import.meta.resolve(`../src/${entry}`));

export function previewAnnotations(entry: string[] = []) {
  return [...entry, addonSrc("preview.ts")];
}

export function managerEntries(entry: string[] = []) {
  return [...entry, addonSrc("manager.tsx")];
}

export {
  managerHead,
  staticDirs,
  viteFinal,
  webpack,
} from "../src/preset.js";
