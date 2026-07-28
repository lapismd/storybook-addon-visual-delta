import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateSpecStructure } from "./check-spec-structure.mjs";

function createFixture(overrides = {}) {
  const packageRoot = mkdtempSync(path.join(os.tmpdir(), "visual-delta-spec-"));
  const sourceDirectory = path.join(packageRoot, "spec", "src");
  const pointerDirectory = path.join(packageRoot, "specs");
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(pointerDirectory, { recursive: true });

  const files = {
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
    "specs/index.md": `# Moved

> Compatibility pointer. This file is non-normative.

[Canonical](../spec/src/index.md)
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
        legacyPointerNames: ["index.md"],
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
      pointers: 1,
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

test("rejects normative compatibility pointers", () => {
  withFixture(
    {
      "specs/index.md": `# Old contract

| ID | Requirement |
| -- | ----------- |
| VD-OLD-001 | This pointer MUST not define behavior. |
`,
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /is not non-normative/);
      assert.match(result.errors.join("\n"), /defines a requirement/);
    },
  );
});

test("requires every preserved legacy pointer to target its replacement", () => {
  withFixture(
    {
      "specs/index.md": `# Moved

> Compatibility pointer. This file is non-normative.

[Wrong canonical page](../spec/src/verification.md)
`,
    },
    (result) => {
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        /expected one pointer to \.\.\/spec\/src\/index\.md, found 0/,
      );
    },
  );

  withFixture({ "specs/index.md": null }, (result) => {
    assert.equal(result.ok, false);
    assert.match(
      result.errors.join("\n"),
      /required compatibility pointer is missing/,
    );
  });
});
