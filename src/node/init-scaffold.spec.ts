import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectVisualDeltaOnboarding,
  runVisualDeltaInit,
} from "./init-scaffold.js";

describe("visual-delta init scaffold", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes suite, playwright config, snapshot dir, and scripts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-init-"));
    dirs.push(root);
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: {} }, null, 2),
    );

    const before = inspectVisualDeltaOnboarding(root);
    expect(before.ready).toBe(false);

    const result = runVisualDeltaInit({ packageRoot: root, port: 6007 });
    expect(result.ok).toBe(true);
    expect(result.written).toContain("tests/visual/storybook.spec.ts");
    expect(result.written).toContain("playwright.config.ts");
    expect(result.scriptsUpdated).toEqual(
      expect.arrayContaining(["test:visual", "visual-delta", "build-storybook"]),
    );

    const suite = readFileSync(
      path.join(root, "tests/visual/storybook.spec.ts"),
      "utf8",
    );
    expect(suite).toContain("defineVisualSuite");
    const config = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
    expect(config).toContain("defineVisualPlaywrightConfig");
    expect(config).toContain("port: 6007");

    const after = inspectVisualDeltaOnboarding(root);
    expect(after.ready).toBe(true);
  });

  it("skips existing files unless force", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-init-"));
    dirs.push(root);
    runVisualDeltaInit({ packageRoot: root, skipPackageJson: true });
    const second = runVisualDeltaInit({
      packageRoot: root,
      skipPackageJson: true,
    });
    expect(second.written).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);

    const forced = runVisualDeltaInit({
      packageRoot: root,
      force: true,
      skipPackageJson: true,
    });
    expect(forced.written).toContain("tests/visual/storybook.spec.ts");
  });
});
