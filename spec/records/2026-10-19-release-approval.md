# Explicit approval before Wave 1 publication

The user authorized dependency-first source integration and release preparation,
with a separate approval before each public wave. This change updates
VD-GOV-016: a Version Packages merge now prepares a candidate without creating
a public tag. Explicit main-branch dispatch must select the exact approved SHA
and opt in to tag creation. The existing tag immutability, npm environment,
package and compare-only browser gates remain required.

## Before state

- Default source contains readiness fix `9e56a7e308d8` and landing `281ae5c49739`.
  GitHub main is `952f246e25ae`; the source patch is not yet public.
- `.changeset/navigation-readiness-root.md` requests a patch from `0.0.7`.
- The version workflow automatically tagged Version Packages merges.
- `gh api repos/lapismd/storybook-addon-visual-delta/environments/npm` returned
  no protection rules, contrary to the existing reviewer requirement.

## Changes and qualification

- Manual tag dispatch defaults false and binds a full source SHA to the
  checkout, canonical main history, completed Changesets and versioning commit.
- New approval/source tests cover pushes, forks, other branches, missing
  consent, floating/changed revisions, pending Changesets and ordinary commits.
- `gh api --method PUT .../environments/npm` added required reviewer `stevejuma`.
  Read-back confirms `required_reviewers`; branch policy remains unrestricted
  so approved version tags can use the protected npm job. No review or publish
  was approved by automation.
- `node --test scripts/check-release-source.spec.mjs
scripts/ensure-release-tag.spec.mjs scripts/check-npm-release.spec.mjs`:
  **19 passed**, zero failures. Repeated new source tests after formatting:
  **5 passed**, zero failures.
- `pnpm exec vitest run src/playwright/readiness.spec.ts`: **3 passed**.
- `pnpm typecheck` and `pnpm build:node`: pass.
- `pnpm spec:check`: six lanes pass, including **82 repository script tests**,
  counted-line architecture, CI-image contract, mdBook and spec-first.
- `pnpm publint`: pass; existing repository-URL suggestion remains informational
  because the release metadata guard intentionally requires its canonical URL.

Local versions: Node `24.10.0`, pnpm `10.32.1`, Vitest `4.1.10`, macOS ARM64.
Hosted CI retains pinned Node `24.15.0`; local focused checks are not substituted
for those exact-source hosted/browser gates.

## Remaining gates

Push source through a protected PR, qualify and merge it, then prepare the
`0.0.8` Version Packages candidate and its artifact. Record its exact source,
version, CI, checksums and limitations before asking for publication approval.
Public tag, npm publication, GitHub release and consumer verification remain
pending. No baseline, threshold, registry version or installed app changes.
