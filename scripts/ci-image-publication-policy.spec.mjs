import assert from "node:assert/strict";
import test from "node:test";
import { loadCiImageSources, validateCiImageSources } from "./check-ci-image.mjs";
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
