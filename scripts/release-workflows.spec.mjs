import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workflow keeps automatic version PRs separate from approved tag creation", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const tagJob = workflow.split("\n  tag:\n")[1];
  assert.match(workflow, /create_tag:[\s\S]*?default: false/);
  assert.match(
    workflow,
    /name: Update Version Packages pull request\n    if: github.event_name == 'push'/,
  );
  assert.match(
    tagJob,
    /if: github.event_name == 'workflow_dispatch'.*inputs.create_tag/,
  );
  assert.match(tagJob, /ref: \$\{\{ inputs.source \}\}/);
  assert.match(tagJob, /run: node scripts\/check-release-source.mjs/);
  assert.ok(
    tagJob.indexOf("check-release-source.mjs") <
      tagJob.indexOf("pnpm release:tag --push"),
  );
});

test("qualification workflow cannot tag or publish and retains candidate evidence", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/qualify-release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /contents: read\n  packages: read/);
  assert.doesNotMatch(
    workflow,
    /(?:contents|packages|id-token): write|environment:|RELEASE_TAG_TOKEN|npm publish|release:tag|git tag|git push|workflow_run:/,
  );
  assert.match(workflow, /check-release-source\.mjs --candidate/);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ inputs.source \}\}/);
  assert.match(
    workflow,
    /GITHUB_REF="refs\/tags\/v\$version" node scripts\/check-release-audit\.mjs/,
  );
  assert.match(
    workflow,
    /RELEASE_AUDIT_APPROVED_SOURCE: \$\{\{ vars\.VD_015_AUDIT_APPROVED_SOURCE \}\}/,
  );
  assert.match(
    workflow,
    /image: ghcr\.io\/lapismd\/storybook-addon-visual-delta-ci@sha256:[a-f0-9]{64}/,
  );
  assert.match(workflow, /env:\n        HOME: \/root/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/upload-artifact@v6/);
  assert.match(workflow, /npm install --ignore-scripts/);
  assert.match(workflow, /npm audit/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.ok(
    workflow.indexOf("check-release-source.mjs --candidate") <
      workflow.indexOf("pnpm install --frozen-lockfile"),
  );
});
