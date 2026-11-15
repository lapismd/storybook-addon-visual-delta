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

test("version PR authority is confined to the canonical main App boundary", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const version = workflow.match(/\n  version:[\s\S]*?(?=\n  [\w-]+:|$)/)?.[0];
  assert.ok(version, "version job exists");
  assert.match(
    version,
    /if: github\.event_name == 'push' && github\.repository == 'lapismd\/storybook-addon-visual-delta' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(version, /permissions:\n      contents: read\n/);
  assert.doesNotMatch(version, /\n      [\w-]+: write|environment:|id-token:/);
  const checkout = version.match(
    /- name: Check out main[\s\S]*?(?=\n      - )/,
  )?.[0];
  assert.match(checkout, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(checkout, /fetch-depth: 0/);
  assert.match(checkout, /persist-credentials: false/);
  assert.doesNotMatch(checkout, /\n          token:/);
  const app = version.match(
    /- name: Create repository version token[\s\S]*?(?=\n      - )/,
  )?.[0];
  assert.ok(app, "App token mint exists");
  assert.match(app, /id: version-app/);
  assert.match(
    app,
    /actions\/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510/,
  );
  assert.match(
    app,
    /client-id: \$\{\{ vars\.LAPIS_DEPENDENCY_APP_CLIENT_ID \}\}/,
  );
  assert.match(
    app,
    /private-key: \$\{\{ secrets\.LAPIS_DEPENDENCY_APP_PRIVATE_KEY \}\}/,
  );
  assert.match(
    app,
    /owner: lapismd\n          repositories: storybook-addon-visual-delta\n/,
  );
  assert.deepEqual(
    [...app.matchAll(/permission-([\w-]+): (\w+)/g)].map(([, key, value]) => [
      key,
      value,
    ]),
    [
      ["contents", "write"],
      ["pull-requests", "write"],
    ],
  );
  assert.doesNotMatch(app, /skip-token-revoke: true/);
  const changesets = version.match(
    /- name: Create or update Version Packages pull request[\s\S]*/,
  )?.[0];
  assert.match(
    changesets,
    /changesets\/action@63a615b9cd06ba9a3e6d13796c7fbcb080a60a0b/,
  );
  assert.match(changesets, /version: pnpm release:version/);
  assert.match(changesets, /commitMode: github-api/);
  assert.match(changesets, /createGithubReleases: false/);
  assert.match(
    changesets,
    /GITHUB_TOKEN: \$\{\{ steps\.version-app\.outputs\.token \}\}/,
  );
  assert.doesNotMatch(
    changesets,
    /github-token:|publish:|secrets\.GITHUB_TOKEN|github\.token|\|\|/,
  );
  assert.equal((version.match(/GITHUB_TOKEN:/g) ?? []).length, 1);
  assert.equal(
    (workflow.match(/steps\.version-app\.outputs\.token/g) ?? []).length,
    1,
  );
  assert.equal((workflow.match(/create-github-app-token@/g) ?? []).length, 1);
  assert.ok(
    version.indexOf("Install dependencies") <
      version.indexOf("Create repository version token"),
  );
  assert.ok(
    version.indexOf("Create repository version token") <
      version.indexOf("Create or update Version Packages"),
  );
});
