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
      expect.arrayContaining([
        "test:visual",
        "test:visual:affected",
        "visual-delta",
        "build-storybook",
      ]),
    );
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:visual"]).toBe("visual-delta test --all");
    expect(pkg.scripts["test:visual:affected"]).toBe(
      "visual-delta test --affected",
    );
    expect(pkg.scripts["build-storybook"]).toContain("--stats-json");
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(
      ".visual-delta/artifacts/",
      ".visual-delta/cache/",
    );

    const suite = readFileSync(
      path.join(root, "tests/visual/storybook.spec.ts"),
      "utf8",
    );
    expect(suite).toContain("defineVisualSuite");
    expect(suite).toContain(
      '@lapismd/storybook-addon-visual-delta/playwright',
    );
    const config = readFileSync(
      path.join(root, "playwright.config.ts"),
      "utf8",
    );
    expect(config).toContain("defineVisualPlaywrightConfig");
    expect(config).toContain(
      '@lapismd/storybook-addon-visual-delta/playwright',
    );
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
