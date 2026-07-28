import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateSpecStructure } from "./check-spec-structure.mjs";

function createFixture(overrides = {}) {
  const packageRoot = mkdtempSync(path.join(os.tmpdir(), "visual-delta-spec-"));
  const sourceDirectory = path.join(packageRoot, "spec", "src");
  mkdirSync(sourceDirectory, { recursive: true });

  const files = {
    "AGENTS.md": "# Agent guide\n",
    "DEVELOPMENT.md": "# Development\n",
    "README.md": "# Package\n",
    "spec/book.toml": `[book]
src = "src"

[build]
build-dir = "book"
`,
    "spec/src/SUMMARY.md": `# Summary

- [System](index.md)
- [Verification](verification.md)
`,
    "spec/src/index.md": `# System

[Verification](./verification.md)

| ID | Requirement |
| -- | ----------- |
| VD-TEST-001 | The system MUST remain specified. |
`,
    "spec/src/verification.md": `# Verification

\`VD-TEST-001\`
`,
    ...overrides,
  };

  for (const [relativePath, source] of Object.entries(files)) {
    const absolutePath = path.join(packageRoot, relativePath);
    if (source === null) {
      rmSync(absolutePath, { force: true });
      continue;
    }
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return packageRoot;
}

function withFixture(overrides, assertion) {
  const packageRoot = createFixture(overrides);
  try {
    assertion(
      validateSpecStructure({
        packageRoot,
      }),
    );
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
}

test("accepts a complete canonical specification", () => {
  withFixture({}, (result) => {
    assert.equal(result.ok, true);
    assert.deepEqual(result.stats, {
      pages: 2,
      requirements: 1,
    });
  });
});

test("rejects duplicate requirement IDs", () => {
  withFixture(
    {
      "spec/src/SUMMARY.md": `# Summary

- [System](index.md)
- [Other](other.md)
- [Verification](verification.md)
`,
      "spec/src/other.md": `# Other

| ID | Requirement |
| -- | ----------- |
| VD-TEST-001 | Duplicate. |
`,
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /VD-TEST-001: defined 2 times/);
    },
  );
});

test("rejects broken links and unindexed pages", () => {
  withFixture(
    {
      "spec/src/index.md": `# System

[Missing](./missing.md)

| ID | Requirement |
| -- | ----------- |
| VD-TEST-001 | The system MUST remain specified. |
`,
      "spec/src/orphan.md": "# Orphan\n",
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /broken link/);
      assert.match(
        result.errors.join("\n"),
        /orphan\.md: expected one SUMMARY\.md entry, found 0/,
      );
    },
  );
});

test("rejects untraced requirements", () => {
  withFixture(
    {
      "spec/src/verification.md": "# Verification\n",
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        /VD-TEST-001: missing from spec\/src\/verification\.md/,
      );
    },
  );
});

test("rejects the obsolete specs tree", () => {
  withFixture(
    {
      "specs/index.md": "# Obsolete specification pointer\n",
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        /obsolete specs\/ directory must not exist/,
      );
    },
  );
});

test("requires exactly the allowed package-root Markdown files", () => {
  withFixture(
    {
      "HISTORY.md": "# Historical record\n",
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        /HISTORY\.md: package-root Markdown is limited to/,
      );
    },
  );

  withFixture({ "AGENTS.md": null }, (result) => {
    assert.equal(result.ok, false);
    assert.match(
      result.errors.join("\n"),
      /AGENTS\.md: required package-root Markdown file is missing/,
    );
  });
});
