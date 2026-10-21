# Cold Linux capture correction for Mira qualification

Date: 2026-10-21. Revision: enclosing Jujutsu change. No publication is approved.

Mira PR #16 qualifies full package and packed consumers, then its strict visual
job exposes two Visual Delta 0.0.8 defects. Run 39581024874 discovers zero
targets from a clean stage and then fails with EACCES removing container-root
files. The prior x64/image mismatch belongs to Mira and is already corrected.
This owning change preserves VD-ARCH-001 and VD-RUN-004/007, canonical image
identity, comparison thresholds and baseline safety.

The all/affected worker now builds before interpreting an empty initial target
set as cached success. Actual-cache reuse still precedes building for a complete
nonempty captured set. Dry-run and exact-empty scopes retain their no-build and
no-expansion behavior. The existing cache reuse regression stays unchanged.

Stage cleanup first uses ordinary host deletion. Only EACCES/EPERM may recover
through the same immutable image, with a read-only container root, no network,
no shell, and only the generated private staging directory mounted. It rejects
symlinked/outside targets and mutable images; deletion never follows contained
symlinks. A separate native non-root ARM64 workflow proves actual root-owned
files cannot be removed normally, then verifies cleanup and external data
preservation. Existing authenticated image-only package/browser jobs are intact.

## Local commands and results

- `pnpm exec vitest run src/node/visual-test-cold.spec.ts`: two failures and one
  pass before the fix; both cold modes falsely return success without building.
  The shell initially selects pnpm 12.6.0 and materializes ignored dependencies;
  subsequent qualification explicitly selects Corepack pnpm 10.32.1.
- Exact runner/CLI/cleanup tests initially expose an over-strict static-build
  guard and an incorrect test assumption that global runs use a story grep.
  Preserve the original actual-cache reuse test; allow nonempty reusable actuals
  without a static tree and assert the actual Playwright execution instead.
- The six-file runner, cold CLI, cleanup, static-build and canonical-cache family
  passes 41 cases. Typecheck, Node build and architecture checks pass.
- Initial typecheck rejects a nullable profile image passed into cleanup.
  Ordinary host cleanup needs no image; permission recovery now explicitly
  rejects null/mutable images. Final typecheck passes.
- Initial spec check rejects putting the non-root host probe in the existing
  image-only workflow. Move the dedicated host proof to its own workflow and
  preserve every original image-policy assertion. Final spec check passes six
  lanes and all 152 existing script tests.
- Root has no Prettier dependency; the attempted local formatter lookup fails.
  Format only new source/script files with the already installed Prettier 3.8.5
  executable from Mira's development toolchain. No cross-checkout path enters
  package manifests or public runtime resolution.
- `corepack pnpm@10.32.1 install --lockfile-only --ignore-scripts` passes.
  Frozen reinstall initially stops without a TTY when replacing pnpm-12 metadata;
  `CI=true corepack pnpm@10.32.1 install --frozen-lockfile` passes.
- The initial full audit has eight findings. Upgrade development-only Changesets
  2 to maintained 3 and its GitHub changelog adapter, patch Vite on major 6 and
  Markdown-it on major 15. Fresh audit retains only high braces@3.0.3 through
  markdownlint-cli2; no patched release exists. Production audit is separately
  required. The consumed 0.0.8 exception does not apply to 0.0.9.
- `corepack pnpm@10.32.1 exec changeset status --output
  /tmp/visual-delta-cold-version.json` proposes patch 0.0.9. The single-package
  Manypkg reader regression qualifies the maintained release-tool graph.

Final focused commands: architecture, package typecheck, Node build, standalone
Manypkg regression, release intent, native-workflow actionlint and production
audit pass. Production audit has zero findings. Changesets 3 proposes exactly
0.0.9. The remaining full-audit high finding is only
`.>markdownlint-cli2>micromatch>braces`; fresh exception/publication approval
remains absent. The specification run passes all six lanes and 152 existing
script cases, with the additional reader case independently passing.

Raw audit reports: `/tmp/visual-delta-cold-audit{,-after}.json`. No source test
assertions, baseline bytes, image profile or release gate is weakened. Native
Docker ownership proof and full package/panel/browser-matrix/manager CI remain
hosted gates; no local browser or image build is run.

## Publication and downstream status

Prepare a protected source PR and retain exact CI outcomes. Any 0.0.9 publication
needs its own reviewed source/version/archive and audit decision. Do not inherit
0.0.8 approval, exception or published bytes. Mira cannot finish adopting this fix
until the corrected package resolves publicly and its real consumer comparison
passes. Other Mira and Desktop distribution/installation/retirement gates remain
open; this portable runner repair does not qualify those products.
