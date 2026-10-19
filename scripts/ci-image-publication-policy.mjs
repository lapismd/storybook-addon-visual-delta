export const REQUIRED_PUBLICATION_SNIPPETS = [
  "workflow_dispatch:",
  "if: github.event_name == 'workflow_dispatch' && github.repository == 'lapismd/storybook-addon-visual-delta' && inputs.publish",
  "default: false",
  "environment: ci-image",
  "ref: ${{ inputs.source }}",
  "node scripts/check-ci-image-source.mjs",
  "PLAYWRIGHT_VERSION=${{ steps.source.outputs.playwright_version }}",
  "source_revision: ${{ steps.source.outputs.source_revision }}",
  "org.opencontainers.image.revision=${{ inputs.source }}",
  'test "$playwright_version" = "$EXPECTED_PLAYWRIGHT_VERSION"',
  "SOURCE_REVISION: ${{ needs.publish.outputs.source_revision }}",
  "sourceRevision: $sourceRevision",
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

export function publicationPolicyErrors(source) {
  const errors = REQUIRED_PUBLICATION_SNIPPETS.filter(
    (snippet) => !source.includes(snippet),
  ).map((snippet) => `publish workflow: missing ${snippet}`);
  for (const architecture of ["x64", "arm64"]) {
    const job =
      source
        .split(`  smoke-${architecture}:`)[1]
        ?.split(/\n  [a-z][a-z0-9-]*:/)[0] ?? "";
    const step = job.split("    steps:\n")[1]?.split("      - name:")[1] ?? "";
    if (!step.includes("        env:\n          HOME: /root\n"))
      errors.push(
        `publish workflow: native ${architecture} smoke must restore root-owned HOME for Firefox`,
      );
    if (
      !step.includes("EXPECTED_LOCK_SHA256:") ||
      !step.includes('= "$EXPECTED_LOCK_SHA256"')
    )
      errors.push(
        `publish workflow: native ${architecture} smoke must verify embedded lock identity`,
      );
  }
  return errors;
}
