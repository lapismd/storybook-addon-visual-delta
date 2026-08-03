import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { previewModulesNewerThanIndex } from "./static-build.js";

describe("static Storybook freshness", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads preview modules from the canonical Visual Delta cache", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-static-build-"));
    roots.push(root);
    const indexPath = path.join(root, "storybook-static/index.json");
    const modulePath = path.join(root, "src/example.tsx");
    const statsPath = path.join(
      root,
      ".visual-delta/cache/preview-stats.json",
    );
    mkdirSync(path.dirname(indexPath), { recursive: true });
    mkdirSync(path.dirname(modulePath), { recursive: true });
    mkdirSync(path.dirname(statsPath), { recursive: true });
    writeFileSync(indexPath, JSON.stringify({ entries: {} }));
    writeFileSync(modulePath, "export const example = true;\n");
    writeFileSync(
      statsPath,
      JSON.stringify({ modules: [{ id: "./src/example.tsx" }] }),
    );

    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    const newTime = new Date("2026-01-01T00:00:01.000Z");
    utimesSync(indexPath, oldTime, oldTime);
    utimesSync(modulePath, newTime, newTime);

    expect(previewModulesNewerThanIndex(root)).toBe(true);
  });
});
