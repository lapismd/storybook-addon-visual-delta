import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicationPolicyErrors } from "./ci-image-publication-policy.mjs";
import {
  loadCiImageSources,
  validateCiImageSources,
} from "./check-ci-image.mjs";
const sources = loadCiImageSources();

test("requires exact-source publication approval, environment and provenance", () => {
  for (const guard of [
    " && inputs.publish",
    "environment: ci-image",
    "default: false",
    "ref: ${{ inputs.source }}",
    "node scripts/check-ci-image-source.mjs",
    "PLAYWRIGHT_VERSION=${{ steps.source.outputs.playwright_version }}",
    "org.opencontainers.image.revision=${{ inputs.source }}",
    "sourceRevision: $sourceRevision",
  ]) {
    const result = validateCiImageSources({
      ...sources,
      publishWorkflow: sources.publishWorkflow.replace(guard, ""),
    });
    assert.equal(result.ok, false, guard);
  }
});

test("requires workspace overrides in the frozen image build context", () => {
  const result = validateCiImageSources({
    ...sources,
    dockerignore: sources.dockerignore.replace("!pnpm-workspace.yaml\n", ""),
    dockerfile: sources.dockerfile.replace("pnpm-workspace.yaml ", ""),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /pnpm-workspace/);
});

for (const architecture of ["x64", "arm64"]) {
  test(`native ${architecture} smoke restores root HOME at step scope`, () => {
    const job = sources.publishWorkflow
      .split(`  smoke-${architecture}:`)[1]
      .split(/\n  [a-z][a-z0-9-]*:/)[0];
    const step = job.split("    steps:\n")[1].split("      - name:")[1];
    assert.match(step, /        env:\n          HOME: \/root\n/);
  });
}

for (const architecture of ["x64", "arm64"]) {
  test(`policy rejects missing ${architecture} step HOME and lock verification`, () => {
    const start = sources.publishWorkflow.indexOf(`  smoke-${architecture}:`);
    const prefix = sources.publishWorkflow.slice(0, start);
    const job = sources.publishWorkflow.slice(start);
    const errors = publicationPolicyErrors(
      prefix +
        job
          .replace("          HOME: /root\n", "")
          .replace('= "$EXPECTED_LOCK_SHA256"', '= "unverified"'),
    );
    assert.match(errors.join("\n"), new RegExp(`${architecture}.*HOME`));
    assert.match(errors.join("\n"), new RegExp(`${architecture}.*lock`));
  });
}

const recovery = readFileSync(
  new URL("../.github/workflows/verify-visual-delta-ci.yml", import.meta.url),
  "utf8",
);
test("verification reuses identical native acceptance and profile assembly", () => {
  const jobs = sources.publishWorkflow
    .slice(sources.publishWorkflow.indexOf("  smoke-x64:"))
    .replaceAll("needs.publish.", "needs.verify.")
    .replaceAll("needs: publish", "needs: verify")
    .replace("needs: [publish,", "needs: [verify,");
  assert.equal(recovery.slice(recovery.indexOf("  smoke-x64:")), jobs);
});

test("recovery is manual and read-only with source, tag, digest and lock proof", () => {
  assert.match(recovery, /permissions:\n  contents: read\n  packages: read\n/);
  assert.doesNotMatch(
    recovery,
    /: write|build-push-action|login-action|push: true|^  (push|schedule|pull_request):/m,
  );
  for (const guard of [
    "workflow_dispatch:",
    'test "$GITHUB_REF_NAME" = "$DEFAULT_BRANCH"',
    'test "$(git rev-parse HEAD)" = "$SOURCE_REVISION"',
    'anonymous_docker_config="$(mktemp -d)"',
    "{{.Manifest.Digest}}",
    "org.opencontainers.image.revision",
    "sha256sum pnpm-lock.yaml",
    "needs: [verify, smoke-x64, smoke-arm64]",
    "SOURCE_REVISION: ${{ needs.verify.outputs.source_revision }}",
  ])
    assert.ok(recovery.includes(guard), guard);
});
