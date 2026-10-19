import assert from "node:assert/strict";
import test from "node:test";
import { approvedImageSource } from "./check-ci-image-source.mjs";

const candidate = {
  source: "a".repeat(40),
  revision: "a".repeat(40),
  approved: "true",
  manifest: {
    devDependencies: { playwright: "1.62.1", "@playwright/test": "1.62.1" },
  },
};

test("accepts a reviewed exact source with paired Playwright versions", () => {
  assert.deepEqual(approvedImageSource(candidate), {
    source_revision: candidate.source,
    playwright_version: "1.62.1",
  });
});
test("rejects unapproved publication", () => {
  for (const approved of [undefined, "false", true])
    assert.throws(
      () => approvedImageSource({ ...candidate, approved }),
      /approval/,
    );
});
test("rejects floating, abbreviated and changed source revisions", () => {
  for (const source of [
    undefined,
    "main",
    "a".repeat(12),
    "a".repeat(40) + "\n",
  ])
    assert.throws(
      () => approvedImageSource({ ...candidate, source }),
      /source SHA/,
    );
  assert.throws(
    () => approvedImageSource({ ...candidate, revision: "b".repeat(40) }),
    /source SHA/,
  );
});
test("rejects absent, floating and unpaired browser versions", () => {
  for (const playwright of [
    undefined,
    "latest",
    "^1.62.1",
    "1.62.1-beta.1",
    "1.61.1",
    "1.62.1\n",
  ])
    assert.throws(
      () =>
        approvedImageSource({
          ...candidate,
          manifest: {
            devDependencies: { playwright, "@playwright/test": "1.62.1" },
          },
        }),
      /identical exact versions/,
    );
  assert.throws(
    () => approvedImageSource({ ...candidate, manifest: {} }),
    /identical exact versions/,
  );
});
