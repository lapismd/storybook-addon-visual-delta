import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Markdown CLI retains rule failures and the existing formatting exceptions", () => {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("markdownlint-cli/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const executable = path.resolve(
    path.dirname(manifestPath),
    manifest.bin.markdownlint,
  );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = mkdtempSync(path.join(tmpdir(), "visual-delta-markdown-"));
  const file = path.join(directory, "fixture.md");
  const lint = (text) => {
    writeFileSync(file, text);
    return spawnSync(
      process.execPath,
      [executable, "--config", path.join(root, ".markdownlint.json"), file],
      { encoding: "utf8", timeout: 10000 },
    );
  };
  try {
    assert.equal(
      lint(
        `# Title\n\n${"long ".repeat(70).trim()}\n\n| a | b |\n| --- | --- |\n| long content | short |\n`,
      ).status,
      0,
    );
    const rejected = lint("# Title\nMissing heading separation.\n");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stdout + rejected.stderr, /MD022/);
    assert.equal(
      lint(
        "# Title\n\n## Group A\n\n### Shared\n\nBody.\n\n## Group B\n\n### Shared\n\nBody.\n",
      ).status,
      0,
    );
    const duplicate = lint(
      "# Title\n\n## Shared\n\nBody.\n\n## Shared\n\nBody.\n",
    );
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stdout + duplicate.stderr, /MD024/);
    const script = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ).scripts["spec:lint"];
    for (const target of [
      "AGENTS.md",
      "DEVELOPMENT.md",
      "README.md",
      "spec/src/**/*.md",
    ])
      assert.ok(script.includes(target));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
