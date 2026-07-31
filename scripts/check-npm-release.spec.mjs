import assert from "node:assert/strict";
import test from "node:test";

import {
  NPM_REGISTRY,
  PACKAGE_NAME,
  REPOSITORY_URL,
  validateNpmRelease,
} from "./check-npm-release.mjs";

function manifest(overrides = {}) {
  return {
    name: PACKAGE_NAME,
    version: "0.0.1",
    repository: {
      type: "git",
      url: REPOSITORY_URL,
    },
    publishConfig: {
      access: "public",
      registry: NPM_REGISTRY,
    },
    ...overrides,
  };
}

test("uses the public Lapis package and GitHub repository identities", () => {
  assert.equal(PACKAGE_NAME, "@lapismd/storybook-addon-visual-delta");
  assert.equal(
    REPOSITORY_URL,
    "https://github.com/lapismd/storybook-addon-visual-delta.git",
  );
});

test("accepts the exact public stable release", () => {
  const result = validateNpmRelease(manifest(), { tag: "v0.0.1" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("rejects a tag that does not equal the package version", () => {
  const result = validateNpmRelease(manifest(), { tag: "v0.0.2" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /tag must exactly equal v0\.0\.1/);
});

test("rejects prereleases and private or malformed public metadata", () => {
  const result = validateNpmRelease(
    manifest({
      version: "1.0.0-rc.1",
      private: true,
      publishConfig: { access: "restricted", registry: "https://example.test" },
      repository: { type: "git", url: "https://example.test/repository.git" },
    }),
    { tag: "v1.0.0-rc.1" },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /stable X\.Y\.Z/);
  assert.match(result.errors.join("\n"), /must not be private/);
  assert.match(result.errors.join("\n"), /publishConfig\.access/);
  assert.match(result.errors.join("\n"), /publishConfig\.registry/);
  assert.match(result.errors.join("\n"), /repository\.url/);
});
