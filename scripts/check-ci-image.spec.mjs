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
  assert.match(
    result.errors.join("\n"),
    /expected 1 mutable toolchain job container/,
  );
  assert.match(result.errors.join("\n"), /every job must use the expected/);
});

test("requires root-owned HOME in every repository job container", () => {
  const workflowPath = ".github/workflows/visual-delta-ci.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath].replace(
        "  HOME: /root",
        "  HOME: /github/home",
      ),
    },
    publishWorkflow: sources.publishWorkflow.replace(
      "      HOME: /root",
      "      HOME: /github/home",
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /workflow-level root-owned HOME/);
  assert.match(result.errors.join("\n"), /native smoke containers/);
});

test("requires a complete and trusted checkout for the exact PR change set", () => {
  const workflowPath = ".github/workflows/visual-delta-spec-first.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath]
        .replace("fetch-depth: 0", "fetch-depth: 1")
        .replace(
          'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
          'echo "$GITHUB_WORKSPACE"',
        ),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /fetch-depth/);
  assert.match(result.errors.join("\n"), /safe.directory/);
});

test("requires ARM64 visual jobs to use the reviewed immutable profile", () => {
  const workflowPath = ".github/workflows/visual-delta-ci.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath]
        .replace("runs-on: ubuntu-24.04-arm", "runs-on: ubuntu-latest")
        .replace(
          "@sha256:71968d021eb75280f66dec675bc2b8b9e2224734cf58ca1ea0c06019969df705",
          "@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /ARM64 runner/);
  assert.match(result.errors.join("\n"), /immutable ARM64 job container/);
});

test("rejects restoring non-blocking ARM64 canary jobs after profile lock", () => {
  const workflowPath = ".github/workflows/visual-delta-ci.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath].replace(
        "    runs-on: ubuntu-24.04-arm",
        "    runs-on: ubuntu-24.04-arm\n    continue-on-error: true",
      ),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /expected 0 canary job/);
});

test("requires the capture-profile source to match the reviewed publication", () => {
  const result = validateCiImageSources({
    ...sources,
    captureProfile: sources.captureProfile.replace(
      'chromium: "149.0.7827.0"',
      'chromium: "unreviewed"',
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /capture profile/);
  assert.match(result.errors.join("\n"), /chromium/);
});

test("requires the split release gates and browser-only authorized capture workflow", () => {
  const releasePath = ".github/workflows/npm-publish.yml";
  const capturePath = ".github/workflows/capture-canonical-panel-baselines.yml";
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [releasePath]: sources.consumerWorkflows[releasePath].replace(
        "visual-gate:",
        "visual-check:",
      ),
      [capturePath]: sources.consumerWorkflows[capturePath]
        .replace('test "$BASELINE_WRITE_APPROVED" = "true"', "true")
        .replace("*-chromium.png", "*-chromium-linux.png"),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /visual-gate/);
  assert.match(result.errors.join("\n"), /BASELINE_WRITE_APPROVED/);
  assert.match(result.errors.join("\n"), /platform-qualified/);
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

test("requires fixed Corepack storage and Bash in publication containers", () => {
  const result = validateCiImageSources({
    ...sources,
    dockerfile: sources.dockerfile.replace(
      "COREPACK_HOME=/corepack",
      "COREPACK_HOME=/root/.cache/node/corepack",
    ),
    publishWorkflow: sources.publishWorkflow.replace(
      "defaults:\n  run:\n    shell: bash",
      "defaults:\n  run:\n    shell: sh",
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /COREPACK_HOME/);
  assert.match(result.errors.join("\n"), /shell: bash/);
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

test("requires complete profile provenance after both native smoke jobs", () => {
  const result = validateCiImageSources({
    ...sources,
    publishWorkflow: sources.publishWorkflow
      .replace(
        "needs: [publish, smoke-x64, smoke-arm64]",
        "needs: publish",
      )
      .replace("browser.version()", '"declared"')
      .replace("fc-list --format='%{file}\\n'", "printf '%s\\n'")
      .replace(
        "path: visual-delta-arm64-native-evidence/",
        "path: visual-delta-arm64-browsers.json",
      ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /smoke-x64, smoke-arm64/);
  assert.match(result.errors.join("\n"), /browser\.version/);
  assert.match(result.errors.join("\n"), /fc-list/);
  assert.match(result.errors.join("\n"), /native-evidence/);
});

test("requires semantic verification of both published architectures", () => {
  const result = validateCiImageSources({
    ...sources,
    publishWorkflow: sources.publishWorkflow.replace(
      'test "$arm64_count" = "1"',
      'grep -q \'"architecture":"arm64"\' <<<"$audit_manifest"',
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /arm64_count/);
});
