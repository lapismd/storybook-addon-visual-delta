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
  "npm install --global npm@12.0.2",
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
  'find /ms-playwright -type f -name firefox',
  'find /ms-playwright -type f -name MiniBrowser',
];

const REQUIRED_PUBLICATION_SNIPPETS = [
  "workflow_dispatch:",
  "contents: read",
  "packages: write",
  "cancel-in-progress: false",
  "test \"$GITHUB_REF_NAME\" = \"$DEFAULT_BRANCH\"",
  'test "$IMAGE_TAG" != "latest"',
  'if docker buildx imagetools inspect "$AUDIT_IMAGE" >/dev/null 2>&1; then',
  "docker/build-push-action@v6",
  "platforms: linux/amd64,linux/arm64",
  "${{ env.VISUAL_DELTA_CI_IMAGE }}:${{ inputs.tag }}",
  "${{ env.VISUAL_DELTA_CI_IMAGE }}:latest",
  "cache-from: type=gha",
  "cache-to: type=gha,mode=max",
  'test "$audit_manifest" = "$latest_manifest"',
  "'\"architecture\":\"amd64\"'",
  "'\"architecture\":\"arm64\"'",
];

function requireSnippet(errors, label, source, snippet) {
  if (!source.includes(snippet)) {
    errors.push(`${label}: missing required text ${JSON.stringify(snippet)}`);
  }
}

export function validateCiImageSources({
  dockerfile,
  dockerignore,
  packageJson,
  publishWorkflow,
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
  }

  for (const snippet of REQUIRED_DOCKERFILE_SNIPPETS) {
    requireSnippet(errors, "Dockerfile", dockerfile, snippet);
  }
  if (/^\s*COPY\s+\.\s+/m.test(dockerfile)) {
    errors.push("Dockerfile: broad COPY . is prohibited");
  }
  if (/\bcargo\s+(?:install|build)\b/.test(dockerfile)) {
    errors.push("Dockerfile: mdBook must use verified binaries, not Cargo compilation");
  }
  if (dockerignore !== EXPECTED_DOCKERIGNORE) {
    errors.push(
      ".dockerignore: build context must contain only package.json and pnpm-lock.yaml",
    );
  }

  const triggerEnd = publishWorkflow.indexOf("\npermissions:");
  const triggerBlock = publishWorkflow.slice(0, triggerEnd);
  if (/^\s{2}(?:push|pull_request|schedule):/m.test(triggerBlock)) {
    errors.push("publish workflow: only workflow_dispatch may trigger publication");
  }
  for (const snippet of REQUIRED_PUBLICATION_SNIPPETS) {
    requireSnippet(errors, "publish workflow", publishWorkflow, snippet);
  }

  const permissionMatch = publishWorkflow.match(
    /permissions:\n(?<body>(?: {2}[^\n]+\n)+)/,
  );
  if (permissionMatch?.groups?.body !== "  contents: read\n  packages: write\n") {
    errors.push(
      "publish workflow: permissions must be exactly contents: read and packages: write",
    );
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
  console.log("Visual Delta CI-image publication configuration is valid.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
