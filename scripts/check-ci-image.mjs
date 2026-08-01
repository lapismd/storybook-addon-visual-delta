#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const EXPECTED_DOCKERIGNORE = `*
!package.json
!pnpm-lock.yaml
`;

const REQUIRED_DOCKERFILE_SNIPPETS = [
  "FROM node:24.15.0-bookworm",
  "fontconfig",
  "jq",
  "npm install --global npm@12.0.2",
  "COREPACK_HOME=/corepack",
  "corepack prepare pnpm@10.32.1 --activate",
  "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
  "pnpm config set store-dir /pnpm/store",
  'mdbook_target="x86_64-unknown-linux-musl"',
  'mdbook_target="aarch64-unknown-linux-musl"',
  'mdbook_sha256="5222beabd3e37dc5be0d18ff99b79058469354db5c220153a1b92db5ba12be89"',
  'mdbook_sha256="753e5c5c363ee8a56972344dcf91466f005a51db84a7aeffe427ae3ef83d6d44"',
  "https://github.com/rust-lang/mdBook/releases/download/v0.5.4/",
  "sha256sum --check --strict",
  "pnpm install --frozen-lockfile --ignore-scripts",
  "pnpm exec playwright install --with-deps chromium firefox webkit",
  'test "$(node --version)" = "v24.15.0"',
  'test "$(npm --version)" = "12.0.2"',
  'test "$(pnpm --version)" = "10.32.1"',
  'mdbook --version | grep -Fx "mdbook v0.5.4"',
  'pnpm exec playwright --version | grep -Fx "Version 1.61.1"',
  "find /ms-playwright -type f -name firefox",
  "find /ms-playwright -type f -name MiniBrowser",
];

const REQUIRED_PUBLICATION_SNIPPETS = [
  "workflow_dispatch:",
  "defaults:\n  run:\n    shell: bash",
  "contents: read",
  "packages: write",
  "cancel-in-progress: false",
  'test "$GITHUB_REF_NAME" = "$DEFAULT_BRANCH"',
  'test "$IMAGE_TAG" != "latest"',
  'if docker buildx imagetools inspect "$AUDIT_IMAGE" >/dev/null 2>&1; then',
  "docker/login-action@v4",
  "docker/setup-qemu-action@v4",
  "docker/setup-buildx-action@v4",
  "docker/build-push-action@v7",
  "platforms: linux/amd64,linux/arm64",
  "${{ env.VISUAL_DELTA_CI_IMAGE }}:${{ inputs.tag }}",
  "${{ env.VISUAL_DELTA_CI_IMAGE }}:latest",
  "cache-from: type=gha",
  "cache-to: type=gha,mode=max",
  'test "$audit_manifest" = "$latest_manifest"',
  'test "$amd64_count" = "1"',
  'test "$arm64_count" = "1"',
  'anonymous_docker_config="$(mktemp -d)"',
  'DOCKER_CONFIG="$anonymous_docker_config"',
  "arm64_digest=",
  "browser.version()",
  "fc-list --format='%{file}\\n'",
  "fontManifestSha256",
  "visual-delta-arm64-native-evidence",
  "path: visual-delta-arm64-native-evidence/",
  "needs: [publish, smoke-x64, smoke-arm64]",
  'id: "visual-delta-linux-arm64-v1"',
  "arm64ImageDigest",
  "visual-delta-capture-profile.json",
  "Smoke published image on x64",
  "Smoke published image on ARM64",
  "runs-on: ubuntu-24.04-arm",
  "image: ${{ needs.publish.outputs.image_reference }}",
];

const EXPECTED_CONSUMER_WORKFLOWS = {
  ".github/workflows/visual-delta-ci.yml": {
    jobs: 4,
    mutableImageJobs: 1,
    immutableImageJobs: 3,
    frozenInstalls: 4,
    packagesRead: 1,
    x64Runners: 1,
    arm64Runners: 3,
    canaryJobs: 0,
    pendingProfileLocks: 0,
    trustedCheckoutJobs: ["manager"],
    allowedPermissions: new Set(["contents", "packages"]),
  },
  ".github/workflows/visual-delta-spec-first.yml": {
    jobs: 1,
    mutableImageJobs: 1,
    immutableImageJobs: 0,
    frozenInstalls: 1,
    packagesRead: 1,
    x64Runners: 1,
    arm64Runners: 0,
    canaryJobs: 0,
    pendingProfileLocks: 0,
    trustedCheckoutJobs: ["validate"],
    allowedPermissions: new Set(["contents", "packages"]),
  },
  ".github/workflows/npm-publish.yml": {
    jobs: 5,
    mutableImageJobs: 4,
    immutableImageJobs: 1,
    frozenInstalls: 4,
    packagesRead: 4,
    x64Runners: 4,
    arm64Runners: 1,
    canaryJobs: 0,
    pendingProfileLocks: 0,
    trustedCheckoutJobs: ["package-gate", "visual-gate"],
    allowedPermissions: new Set(["contents", "packages", "id-token"]),
  },
  ".github/workflows/capture-canonical-panel-baselines.yml": {
    jobs: 1,
    mutableImageJobs: 0,
    immutableImageJobs: 1,
    frozenInstalls: 1,
    packagesRead: 1,
    x64Runners: 0,
    arm64Runners: 1,
    canaryJobs: 0,
    pendingProfileLocks: 0,
    trustedCheckoutJobs: [],
    allowedPermissions: new Set(["contents", "packages", "pull-requests"]),
  },
};

const TOOLCHAIN_CI_IMAGE =
  "ghcr.io/lapismd/storybook-addon-visual-delta-ci:latest";
const CANONICAL_ARM64_IMAGE_DIGEST =
  "sha256:71968d021eb75280f66dec675bc2b8b9e2224734cf58ca1ea0c06019969df705";
const CANONICAL_IMAGE_DIGEST =
  "sha256:5ddf2fdea54c34ce52e6eae564512d417b024739ce47bc51d81216e10c27623a";
const CANONICAL_FONT_MANIFEST_DIGEST =
  "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3";
const CANONICAL_ARM64_CI_IMAGE = `ghcr.io/lapismd/storybook-addon-visual-delta-ci@${CANONICAL_ARM64_IMAGE_DIGEST}`;
const TOOLCHAIN_IMAGE_LINE = `      image: ${TOOLCHAIN_CI_IMAGE}`;
const CANONICAL_IMAGE_LINE = `      image: ${CANONICAL_ARM64_CI_IMAGE}`;
const CANARY_JOB_LINE = "    continue-on-error: true";
const TRUST_CHECKOUT_LINE =
  '        run: git config --global --add safe.directory "$GITHUB_WORKSPACE"';
const CONTAINER_HOME_LINE = "        HOME: /root";
const STEP_HOME_LINE = "          HOME: /root";
const CONSUMER_USERNAME_LINE = "        username: ${{ github.actor }}";
const CONSUMER_PASSWORD_LINE = "        password: ${{ secrets.GITHUB_TOKEN }}";
const PROHIBITED_CONSUMER_INSTALLS = [
  [/actions\/setup-node@/, "actions/setup-node"],
  [/\bcorepack\s+(?:enable|prepare|install|use)\b/, "Corepack setup"],
  [/\bnpm\s+(?:install|i)\s+(?:--global|-g)\b/, "global npm installation"],
  [/\bcargo\s+install\s+mdbook\b/i, "mdBook compilation"],
  [/\bplaywright\s+install\b/, "Playwright browser installation"],
  [/\bapt(?:-get)?\s+install\b/, "Linux package installation"],
];
const AUDITED_NODE24_ACTIONS = new Set([
  "actions/checkout@v5",
  "actions/configure-pages@v6",
  "actions/deploy-pages@v5",
  "actions/upload-pages-artifact@v5",
  "actions/upload-artifact@v6",
  "peter-evans/create-pull-request@v8",
  "docker/login-action@v4",
  "docker/setup-qemu-action@v4",
  "docker/setup-buildx-action@v4",
  "docker/build-push-action@v7",
]);

const STORYBOOK_PAGES_URL =
  "https://lapismd.github.io/storybook-addon-visual-delta/";

function requireSnippet(errors, label, source, snippet) {
  if (!source.includes(snippet)) {
    errors.push(`${label}: missing required text ${JSON.stringify(snippet)}`);
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function countExactLines(source, line) {
  return source.split("\n").filter((candidate) => candidate === line).length;
}

function workflowJobSection(source, jobName) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^  [a-zA-Z0-9_-]+:\s*$/.test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function workflowContainerBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== "    container:") continue;
    const end = lines.findIndex(
      (line, candidate) =>
        candidate > index && (/^    \S/.test(line) || /^  \S/.test(line)),
    );
    blocks.push(lines.slice(index, end === -1 ? undefined : end).join("\n"));
  }
  return blocks;
}

function workflowStepSections(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("      - ")) continue;
    const end = lines.findIndex(
      (line, candidate) => candidate > index && line.startsWith("      - "),
    );
    blocks.push(lines.slice(index, end === -1 ? undefined : end).join("\n"));
  }
  return blocks;
}

function actionReferences(source) {
  return [...source.matchAll(/^\s+uses:\s+(?<reference>[^\s#]+)\s*$/gm)].map(
    (match) => match.groups?.reference,
  );
}

function permissionKeys(source) {
  const lines = source.split("\n");
  const keys = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(?<indent>\s*)permissions:\s*$/);
    if (!match?.groups) continue;
    const permissionIndent = match.groups.indent.length;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= permissionIndent) {
        index -= 1;
        break;
      }
      if (indent === permissionIndent + 2) {
        const key = line.trim().match(/^(?<key>[a-z-]+):/)?.groups?.key;
        if (key) keys.push(key);
      }
    }
  }
  return keys;
}

function validateConsumerWorkflow(errors, pathLabel, source, expected) {
  const label = `consumer workflow ${pathLabel}`;
  requireSnippet(
    errors,
    label,
    source,
    `  VISUAL_DELTA_CI_IMAGE: ${TOOLCHAIN_CI_IMAGE}`,
  );
  requireSnippet(errors, label, source, "defaults:\n  run:\n    shell: bash");

  for (const [needle, expectedCount, description] of [
    [
      TOOLCHAIN_IMAGE_LINE,
      expected.mutableImageJobs,
      "mutable toolchain job container",
    ],
    [
      CANONICAL_IMAGE_LINE,
      expected.immutableImageJobs,
      "immutable ARM64 job container",
    ],
    [CONSUMER_USERNAME_LINE, expected.jobs, "container username"],
    [CONSUMER_PASSWORD_LINE, expected.jobs, "container token"],
    [
      "pnpm install --frozen-lockfile",
      expected.frozenInstalls,
      "frozen install",
    ],
    ["packages: read", expected.packagesRead, "packages: read permission"],
    ["runs-on: ubuntu-latest", expected.x64Runners, "x64 runner"],
    ["runs-on: ubuntu-24.04-arm", expected.arm64Runners, "ARM64 runner"],
    [
      "PROFILE_LOCK_PENDING",
      expected.pendingProfileLocks,
      "pending profile lock",
    ],
  ]) {
    const actualCount = countOccurrences(source, needle);
    if (actualCount !== expectedCount) {
      errors.push(
        `${label}: expected ${expectedCount} ${description} occurrence(s), found ${actualCount}`,
      );
    }
  }
  const canaryJobCount = countExactLines(source, CANARY_JOB_LINE);
  if (canaryJobCount !== expected.canaryJobs) {
    errors.push(
      `${label}: expected ${expected.canaryJobs} canary job occurrence(s), found ${canaryJobCount}`,
    );
  }
  const trustedCheckoutCount = countExactLines(source, TRUST_CHECKOUT_LINE);
  if (trustedCheckoutCount !== expected.trustedCheckoutJobs.length) {
    errors.push(
      `${label}: expected ${expected.trustedCheckoutJobs.length} trusted checkout occurrence(s), found ${trustedCheckoutCount}`,
    );
  }
  for (const jobName of expected.trustedCheckoutJobs) {
    if (
      countExactLines(
        workflowJobSection(source, jobName),
        TRUST_CHECKOUT_LINE,
      ) !== 1
    ) {
      errors.push(`${label}: ${jobName} must trust its checkout history`);
    }
  }
  const containerBlocks = workflowContainerBlocks(source);
  if (containerBlocks.length !== expected.jobs) {
    errors.push(
      `${label}: expected ${expected.jobs} job container block(s), found ${containerBlocks.length}`,
    );
  }
  for (const block of containerBlocks) {
    if (countExactLines(block, CONTAINER_HOME_LINE) !== 1) {
      errors.push(`${label}: every job container must set root-owned HOME`);
    }
  }
  for (const lowerScopeHome of ["  HOME: /root", "      HOME: /root"]) {
    if (countExactLines(source, lowerScopeHome) !== 0) {
      errors.push(
        `${label}: root-owned HOME must not be set at workflow or job scope`,
      );
    }
  }
  for (const step of workflowStepSections(source)) {
    if (
      step.includes("        run: pnpm test:browsers") &&
      countExactLines(step, STEP_HOME_LINE) !== 1
    ) {
      errors.push(
        `${label}: every browser-matrix run step must restore root-owned HOME for Firefox`,
      );
    }
  }

  for (const [pattern, description] of PROHIBITED_CONSUMER_INSTALLS) {
    if (pattern.test(source)) {
      errors.push(`${label}: ${description} must come from the CI image`);
    }
  }

  const ownedImageLines =
    countOccurrences(source, TOOLCHAIN_IMAGE_LINE) +
    countOccurrences(source, CANONICAL_IMAGE_LINE);
  if (ownedImageLines !== expected.jobs) {
    errors.push(
      `${label}: every job must use the expected mutable toolchain or immutable ARM64 image`,
    );
  }

  for (const permission of permissionKeys(source)) {
    if (!expected.allowedPermissions.has(permission)) {
      errors.push(`${label}: unexpected ${permission} permission`);
    }
  }
}

function validateStorybookPagesWorkflow(errors, source, readme) {
  const label = "Storybook Pages workflow";
  for (const snippet of [
    "  push:\n    branches:\n      - main",
    "  workflow_dispatch:",
    "  contents: read\n  packages: read\n  pages: read",
    "defaults:\n  run:\n    shell: bash",
    "  VISUAL_DELTA_CI_IMAGE: ghcr.io/lapismd/storybook-addon-visual-delta-ci:latest",
    "  group: github-pages",
    "  cancel-in-progress: true",
    "  build:",
    "pnpm install --frozen-lockfile",
    "actions/configure-pages@v6",
    'VISUAL_DELTA_PACKAGE_BASELINES: "1"',
    "pnpm build-storybook",
    "test -f storybook-static/index.html",
    "test -f storybook-static/iframe.html",
    "test -f storybook-static/index.json",
    "actions/upload-pages-artifact@v5",
    "path: storybook-static",
    "  deploy:",
    "needs: build",
    "name: github-pages",
    "      pages: write\n      id-token: write",
    "url: ${{ steps.deployment.outputs.page_url }}",
    "actions/deploy-pages@v5",
  ]) {
    requireSnippet(errors, label, source ?? "", snippet);
  }

  for (const [needle, expectedCount, description] of [
    [TOOLCHAIN_IMAGE_LINE, 1, "toolchain build container"],
    [CONTAINER_HOME_LINE, 1, "root-owned container HOME"],
    [CONSUMER_USERNAME_LINE, 1, "container username"],
    [CONSUMER_PASSWORD_LINE, 1, "container token"],
    ["runs-on: ubuntu-latest", 2, "stable x64 runner"],
  ]) {
    const actualCount = countOccurrences(source ?? "", needle);
    if (actualCount !== expectedCount) {
      errors.push(
        `${label}: expected ${expectedCount} ${description} occurrence(s), found ${actualCount}`,
      );
    }
  }

  const permissions = permissionKeys(source ?? "").sort();
  const expectedPermissions = [
    "contents",
    "id-token",
    "packages",
    "pages",
    "pages",
  ];
  if (JSON.stringify(permissions) !== JSON.stringify(expectedPermissions)) {
    errors.push(
      `${label}: permissions must be exactly contents: read, packages: read, pages: read/write, and id-token: write`,
    );
  }

  for (const prohibited of [
    "--update-snapshots",
    "examples:baselines:capture",
    "pnpm test:panel",
    "pnpm test:manager",
    "pnpm test:browsers",
    "pnpm visual-delta test",
  ]) {
    if ((source ?? "").includes(prohibited)) {
      errors.push(`${label}: prohibited visual command ${prohibited}`);
    }
  }

  if (!(readme ?? "").includes(STORYBOOK_PAGES_URL)) {
    errors.push(`${label}: README must link to ${STORYBOOK_PAGES_URL}`);
  }
}

export function validateCiImageSources({
  dockerfile,
  dockerignore,
  packageJson,
  publishWorkflow,
  consumerWorkflows,
  captureProfile,
  pagesWorkflow,
  readme,
}) {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(packageJson);
  } catch {
    errors.push("package.json: invalid JSON");
  }

  if (manifest) {
    for (const dependency of ["playwright", "@playwright/test"]) {
      if (manifest.devDependencies?.[dependency] !== "1.61.1") {
        errors.push(
          `package.json: devDependencies.${dependency} must be exactly 1.61.1`,
        );
      }
    }
    if (
      manifest.scripts?.["build:node"] !==
      "tsc -p tsconfig.node-build.json && node ./scripts/prepare-cli-bin.mjs"
    ) {
      errors.push(
        "package.json: build:node must prepare the executable CLI bin",
      );
    }
  }

  for (const snippet of [
    `imageDigest:\n    "${CANONICAL_IMAGE_DIGEST}"`,
    `arm64ImageDigest:\n    "${CANONICAL_ARM64_IMAGE_DIGEST}"`,
    'chromium: "149.0.7827.0"',
    'firefox: "151.0"',
    'webkit: "26.5"',
    `fontManifestSha256:\n    "${CANONICAL_FONT_MANIFEST_DIGEST}"`,
  ]) {
    requireSnippet(errors, "capture profile", captureProfile ?? "", snippet);
  }

  for (const snippet of REQUIRED_DOCKERFILE_SNIPPETS) {
    requireSnippet(errors, "Dockerfile", dockerfile, snippet);
  }
  if (/^\s*COPY\s+\.\s+/m.test(dockerfile)) {
    errors.push("Dockerfile: broad COPY . is prohibited");
  }
  if (/\bcargo\s+(?:install|build)\b/.test(dockerfile)) {
    errors.push(
      "Dockerfile: mdBook must use verified binaries, not Cargo compilation",
    );
  }
  if (dockerignore !== EXPECTED_DOCKERIGNORE) {
    errors.push(
      ".dockerignore: build context must contain only package.json and pnpm-lock.yaml",
    );
  }

  const triggerEnd = publishWorkflow.indexOf("\npermissions:");
  const triggerBlock = publishWorkflow.slice(0, triggerEnd);
  if (/^\s{2}(?:push|pull_request|schedule):/m.test(triggerBlock)) {
    errors.push(
      "publish workflow: only workflow_dispatch may trigger publication",
    );
  }
  for (const snippet of REQUIRED_PUBLICATION_SNIPPETS) {
    requireSnippet(errors, "publish workflow", publishWorkflow, snippet);
  }
  const smokeArm64Index = publishWorkflow.indexOf("  smoke-arm64:");
  const profileIndex = publishWorkflow.indexOf("  profile:");
  if (smokeArm64Index < 0 || profileIndex <= smokeArm64Index) {
    errors.push(
      "publish workflow: capture profile must be assembled after native ARM64 smoke",
    );
  }
  const publicationContainers = workflowContainerBlocks(publishWorkflow);
  if (
    publicationContainers.length !== 2 ||
    publicationContainers.some(
      (block) => countExactLines(block, CONTAINER_HOME_LINE) !== 1,
    )
  ) {
    errors.push(
      "publish workflow: both native smoke containers must use root-owned HOME",
    );
  }
  for (const lowerScopeHome of ["  HOME: /root", "      HOME: /root"]) {
    if (countExactLines(publishWorkflow, lowerScopeHome) !== 0) {
      errors.push(
        "publish workflow: root-owned HOME must not be set at workflow or job scope",
      );
    }
  }

  const releaseWorkflow =
    consumerWorkflows?.[".github/workflows/npm-publish.yml"];
  if (typeof releaseWorkflow === "string") {
    for (const snippet of [
      "package-gate:",
      "visual-gate:",
      "needs: [package-gate, visual-gate]",
      "needs.visual-gate.result == 'success'",
      "test -x dist/node/cli.js",
      'select(.path? == "dist/node/cli.js" and .mode? == 493)',
      'bootstrap_npmrc="$RUNNER_TEMP/visual-delta-bootstrap.npmrc"',
      "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}",
      'NPM_CONFIG_USERCONFIG="$bootstrap_npmrc"',
    ]) {
      requireSnippet(errors, "npm publish workflow", releaseWorkflow, snippet);
    }
  }
  const specFirstWorkflow =
    consumerWorkflows?.[".github/workflows/visual-delta-spec-first.yml"];
  if (typeof specFirstWorkflow === "string") {
    for (const snippet of [
      "fetch-depth: 0",
      'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
    ]) {
      requireSnippet(errors, "spec-first workflow", specFirstWorkflow, snippet);
    }
  }
  const captureWorkflow =
    consumerWorkflows?.[
      ".github/workflows/capture-canonical-panel-baselines.yml"
    ];
  if (typeof captureWorkflow === "string") {
    for (const snippet of [
      "BASELINE_WRITE_APPROVED",
      'test "$BASELINE_WRITE_APPROVED" = "true"',
      'VISUAL_DELTA_CANONICAL_PANEL_SNAPSHOTS: "1"',
      "*-chromium.png",
      "pnpm test:panel",
    ]) {
      requireSnippet(
        errors,
        "canonical capture workflow",
        captureWorkflow,
        snippet,
      );
    }
    if (captureWorkflow.includes("-chromium-linux.png")) {
      errors.push(
        "canonical capture workflow: platform-qualified PNG names are prohibited",
      );
    }
  }

  const permissionMatch = publishWorkflow.match(
    /permissions:\n(?<body>(?: {2}[^\n]+\n)+)/,
  );
  if (
    permissionMatch?.groups?.body !== "  contents: read\n  packages: write\n"
  ) {
    errors.push(
      "publish workflow: permissions must be exactly contents: read and packages: write",
    );
  }

  for (const [pathLabel, expected] of Object.entries(
    EXPECTED_CONSUMER_WORKFLOWS,
  )) {
    const source = consumerWorkflows?.[pathLabel];
    if (typeof source !== "string") {
      errors.push(`consumer workflow ${pathLabel}: source is missing`);
      continue;
    }
    validateConsumerWorkflow(errors, pathLabel, source, expected);
  }

  validateStorybookPagesWorkflow(errors, pagesWorkflow, readme);

  for (const [pathLabel, source] of Object.entries({
    ".github/workflows/publish-visual-delta-ci.yml": publishWorkflow,
    ...consumerWorkflows,
    ".github/workflows/publish-storybook-pages.yml": pagesWorkflow,
  })) {
    for (const reference of actionReferences(source ?? "")) {
      if (!reference || !AUDITED_NODE24_ACTIONS.has(reference)) {
        errors.push(
          `${pathLabel}: action ${reference ?? "<unknown>"} is not in the audited Node.js 24 allowlist`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function loadCiImageSources(repoRoot = DEFAULT_REPO_ROOT) {
  const read = (relativePath) =>
    readFileSync(path.join(repoRoot, relativePath), "utf8");
  return {
    dockerfile: read("docker/visual-delta-ci/Dockerfile"),
    dockerignore: read(".dockerignore"),
    packageJson: read("package.json"),
    publishWorkflow: read(".github/workflows/publish-visual-delta-ci.yml"),
    captureProfile: read("src/shared/capture-profile.ts"),
    pagesWorkflow: read(".github/workflows/publish-storybook-pages.yml"),
    readme: read("README.md"),
    consumerWorkflows: Object.fromEntries(
      Object.keys(EXPECTED_CONSUMER_WORKFLOWS).map((relativePath) => [
        relativePath,
        read(relativePath),
      ]),
    ),
  };
}

function main() {
  const result = validateCiImageSources(loadCiImageSources());
  if (!result.ok) {
    console.error("Visual Delta CI-image validation failed:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Visual Delta CI-image publication and reuse are valid.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
