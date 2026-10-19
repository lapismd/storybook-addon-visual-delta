# Wave 1 consolidated dependency candidate

This draft starts from merged main `b236a007cc35f9ece1150474726f306b57449d7c`.
It consolidates all eleven Dependabot proposals reviewed on 2026-10-19 without
replaying their stale lockfiles over the merged security repair. Publication,
image promotion, baseline mutation and merging this candidate are not approved.

## Reviewed inventory

| Bot PR | Proposed target | Candidate disposition |
| --- | --- | --- |
| #26 | brace-expansion 5.0.12 | Already locked by #27; bot PR closed automatically |
| #23 | source-map-js 1.2.2 | Already locked by #27; bot PR closed automatically |
| #22 | devalue 5.9.4 | Already locked by #27; bot PR closed automatically |
| #21 | DOMPurify 3.4.17 | Already locked by #27; bot PR closed automatically |
| #20 | Undici 8.11.2 | Already exceeded by locked 8.12.2; retain newer repair |
| #18 | Vitest 4.1.11 | Already exceeded by locked 4.1.12; retain newer repair |
| #17 | Storybook 10.5.10 | Upgrade core, React Vite, docs and a11y together |
| #16 | Node types 26.3.0 | Upgrade within existing major |
| #15 | Svelte 5.56.10 | Upgrade within existing major |
| #13 | Playwright 1.62.1 | Upgrade together with test package; image gate pending |
| #10 | Playwright test 1.62.1 | Upgrade together with runtime; image gate pending |

The unrelated user PR #8 and Version Packages PR #25 remain untouched. Open bot
PRs remain open until the consolidated candidate lands or an explicit disposition
is approved. This is development tooling only; product dependencies and package
version are unchanged, with an empty Changeset recording that release intent.

## Acceptance surface and before state

The complete surface is package TypeScript, unit tests, built Node exports,
Storybook static compilation, specification and image-pin checks. Shared
Storybook, Playwright and type updates justify package-wide checks; no Rust,
Desktop or other sibling product suites are needed for this draft.

Before editing, `node --test scripts/check-ci-image.spec.mjs` passed all 27
tests and `corepack pnpm@10.32.1 ci:image:check` passed on the exact base tree.
The prior repair's hosted source checks passed, but do not qualify this tree.

## Candidate verification

Results are recorded below before sharing the candidate. Local Node is 26.9.0;
hosted package tooling requires 24.15.0. Lock generation and installation use
explicit Corepack pnpm 10.32.1. No unpinned package-manager invocation is used.

- Lock generation: targeted `corepack pnpm@10.32.1 update --lockfile-only
  --ignore-scripts` for the eight manifest entries above passed. The regenerated
  lock preserves all six already-covered Dependabot targets and scoped security
  overrides. Storybook 10.5.10 itself pins oxc-resolver 11.21.2 (including its
  1.11.0 emnapi bindings); registry manifest inspection confirms these lower
  transitive versions are upstream requirements rather than stale bot replay.
- `CI=true corepack pnpm@10.32.1 install --frozen-lockfile --ignore-scripts`:
  passed under pnpm 10.32.1.
- `corepack pnpm@10.32.1 typecheck`: passed.
- `corepack pnpm@10.32.1 test`: all 551 tests in 116 files passed.
- `corepack pnpm@10.32.1 build-storybook`: passed, including manager and preview
  compilation; emitted stats, index and iframe. Existing large-chunk warnings
  and the Node module-registration deprecation are informational.
- `corepack pnpm@10.32.1 publint`: passed, including fresh Node exports and pack
  inspection; the repository-URL canonicalization suggestion is informational.
- `corepack pnpm@10.32.1 spec:check`: failed at repository script tests,
  81 passed / 1 failed. The failing positive image-configuration test reports
  both Playwright pins must still be 1.61.1. No other script test failed.
- `corepack pnpm@10.32.1 ci:image:check`: failed with exactly those two pin
  mismatches, as required; no validation is weakened.
- Separate `check:architecture`, `spec:lint`, `spec:validate`, `spec:build`,
  `spec:first` and `release:intent` commands passed under explicit pnpm 10.32.1.
- `corepack pnpm@10.32.1 audit --json`: failed with exactly the two known
  unpatched advisories. `corepack pnpm@10.32.1 audit --prod --json`: passed with
  zero findings. The actual locked sprintf-js version is **1.0.3** on both base
  and candidate; the earlier inactive proposal incorrectly says 1.1.3. That
  proposal needs correction and fresh identity review before approval.
- An attempted Node `require` of the pnpm YAML lock failed as a diagnostic
  syntax error. Read-only text inspection and the registry audit confirmed the
  actual versions; no repository content was modified by that diagnostic.

Candidate lock SHA-256:
`7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`.

ARM64 browser interactions and compare-only acceptance remain unqualified.
They require the coordinated image upgrade; a local build/unit pass is not
browser acceptance. No sibling product, Rust, visual baseline or release lane
was run. Hosted checks on the draft are independent evidence.

## Merge and publication blockers

VD-GOV-008, VD-GOV-012 and VD-GOV-013 remain unchanged. The checked-in image,
publisher, capture profile and pin validator still qualify Playwright 1.61.1.
The pin checks must fail on this draft's 1.62.1 candidate. Browser acceptance
against the old image cannot qualify it, and no ad hoc browser installation or
baseline refresh is used to bypass the mismatch.

Prepare a separately reviewed image bootstrap/cutover before merging: the
current publisher only builds default-branch source, so it cannot publish this
unmerged candidate. Resolve that bootstrap explicitly, then obtain approval to
publish the reviewed image, verify native x64/ARM64 smoke, lock actual digests,
browser/font provenance, and canary ARM64 before promoting required consumers.
No future digest is guessed and no publication workflow is dispatched here.

The blocking full audit remains independent. The earlier inactive exception
proposal's lock digest does not apply to this changed candidate. Re-audit and
review the exact final source, lock and package identity before any exception
decision or release approval. No audit exception is applied.
