import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCiImageSources,
  validateCiImageSources,
} from "./check-ci-image.mjs";

const sources = loadCiImageSources();

test("accepts the repository CI-image publication and reuse configuration", () => {
  const result = validateCiImageSources(sources);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("requires every package-tooling job to use the authenticated image", () => {
  const workflowPath = ".github/workflows/visual-delta-ci.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath].replace(
        "      image: ghcr.io/lapismd/storybook-addon-visual-delta-ci:latest",
        "      image: node:latest",
      ),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /expected 4 job container/);
});

test("rejects duplicated toolchain and browser installation", () => {
  const workflowPath = ".github/workflows/visual-delta-spec-first.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: `${sources.consumerWorkflows[workflowPath]}\n# cargo install mdbook\n# pnpm exec playwright install chromium\n`,
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /mdBook compilation/);
  assert.match(result.errors.join("\n"), /Playwright browser installation/);
});

test("rejects drift in pinned runtime and browser versions", () => {
  const result = validateCiImageSources({
    ...sources,
    dockerfile: sources.dockerfile.replace(
      "FROM node:24.15.0-bookworm",
      "FROM node:latest",
    ),
    packageJson: sources.packageJson.replace(
      '"playwright": "1.61.1"',
      '"playwright": "latest"',
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /node:24\.15\.0-bookworm/);
  assert.match(result.errors.join("\n"), /devDependencies\.playwright/);
});

test("rejects a broad Docker context", () => {
  const result = validateCiImageSources({
    ...sources,
    dockerignore: `${sources.dockerignore}!src/**\n`,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /build context/);
});

test("rejects compiling mdBook in the image", () => {
  const result = validateCiImageSources({
    ...sources,
    dockerfile: `${sources.dockerfile}\nRUN cargo install mdbook\n`,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /verified binaries/);
});

test("rejects automatic publication and broader permissions", () => {
  const result = validateCiImageSources({
    ...sources,
    publishWorkflow: sources.publishWorkflow
      .replace("  workflow_dispatch:", "  push:\n  workflow_dispatch:")
      .replace("  packages: write\n", "  packages: write\n  id-token: write\n"),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /only workflow_dispatch/);
  assert.match(result.errors.join("\n"), /permissions must be exactly/);
});

test("rejects publication without default-branch and immutable-tag guards", () => {
  const result = validateCiImageSources({
    ...sources,
    publishWorkflow: sources.publishWorkflow
      .replace(
        'test "$GITHUB_REF_NAME" = "$DEFAULT_BRANCH"',
        'echo "$DEFAULT_BRANCH"',
      )
      .replace('test "$IMAGE_TAG" != "latest"', 'echo "$IMAGE_TAG"')
      .replace(
        'if docker buildx imagetools inspect "$AUDIT_IMAGE" >/dev/null 2>&1; then',
        'echo "$AUDIT_IMAGE"',
      ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /GITHUB_REF_NAME/);
  assert.match(result.errors.join("\n"), /IMAGE_TAG/);
  assert.match(result.errors.join("\n"), /imagetools inspect/);
});
