# Consolidated native parity and 0.1.1 candidate

Requirements: VD-RUN-007/008, VD-BASE-009, VD-GOV-016. Enclosing follow-up change:
`wumumoto`, based on main `c1b21a5501666489074361f841e9361d17df3f57`.

The user requested consolidation of open version-bump PRs into the native
staging follow-up and closure of the superseded PRs after verification.

| PR  | Incorporated version         | Scope                                                 |
| --- | ---------------------------- | ----------------------------------------------------- |
| 42  | Vitest 5.0.5                 | Unit runner and matching transitive test dependencies |
| 43  | Svelte 5.57.2                | Development compiler                                  |
| 44  | Testing Library React 16.3.3 | Component test harness                                |
| 45  | Storybook Icons 2.2.0        | Compatible runtime icon package                       |
| 46  | PostCSS 8.5.31               | Development stylesheet tooling                        |
| 48  | Visual Delta 0.1.1           | Generated package version and changelog               |

Each PR's actual manifest/lockfile patch was inspected. The combined manifest
retains semver ranges for compatible runtime and test dependencies and the
existing exact PostCSS policy. `pnpm up` installed these exact target versions;
the lockfile was then regenerated with pinned pnpm 10.32.1.

`corepack pnpm@10.32.1 release:version` ran the existing Changesets workflow.
It generated version 0.1.1 and the changelog from both merged native-reuse and
new staged-baseline notes, then consumed those Changesets. No published version
or changelog entry was authored by hand. Existing release-intent enforcement
recognizes the consumed Changeset in the complete PR diff; no gate is weakened.

The source correction preserves logical and physical snapshot identity across
CLI, native worker and Playwright. Its regression, architecture extractions,
initial failures and packed validation are recorded in
[native parity evidence](2026-10-24-native-reuse-parity.md).

## Validation before final PR

- Before dependency updates, the corrected source passes 33 focused tests,
  all 618 unit tests, types, seven specification lanes, build and publint.
- The corrected 0.1.0 archive passes Chromium/WebKit native primary, mode,
  interaction, corruption recovery, baseline edits, affected no-op, fresh and
  strict outcome acceptance under the consumer-shaped `tests/visual` layout.
- Cold panel acceptance passes 13 cases. The existing local launcher needs
  owned detached-server cleanup after cases finish; no launcher is modified.
- With all five dependency bumps installed, `VITEST_MAX_WORKERS=4 corepack
pnpm@10.32.1 check` passes 618 tests across 130 files under Vitest 5.0.5,
  types, all seven specification lanes, Node build and publint.
- Changesets versioning succeeds and npm still reports published version 0.1.0.

Final candidate archive/native acceptance, hosted results and superseded-PR
closure are recorded after execution. This is a generated release candidate,
not permission to publish, tag, change CI images or approve visual baselines.

## Completed combined qualification

The exact candidate is signed commit
`1b253cf053985666923e6dbb70d6469abdd8345b` in
[follow-up PR 49](https://github.com/lapismd/storybook-addon-visual-delta/pull/49).

- The 0.1.1 archive SHA-256 is
  `b3e3c514bfd68bc542bd900f580951f654a36bc07a37cead34539583d63e6c2b`.
  All 810 source/dist files equal the consumer's corrected 0.1.0 validation
  archive byte-for-byte. Version/changelog and dependency metadata differ.
- `VISUAL_DELTA_NATIVE_PACKAGE_ROOT=<extracted-0.1.1-package>
VISUAL_DELTA_NATIVE_EXAMPLE_BROWSERS=chromium,webkit corepack pnpm@10.32.1
test:native` passes the complete public-worker acceptance matrix from that
  archive, including interactions, safe corruption recovery, changed-baseline
  recomparison, strict failures and unchanged affected no-op.
- Native workflow `40096890979` passes on macOS 15 and Ubuntu 24.04 with
  Chromium, Firefox and WebKit.
- CI `40096891059` passes package checks, canonical Docker
  Chromium/Firefox/WebKit, panel and manager browser acceptance.
- Specification-first `40096890960` and stage cleanup `40096890935` pass.
- PRs 42, 43, 44, 45, 46 and 48 were re-read to confirm their reviewed heads,
  then closed with links to PR 49 after the complete combined hosted result
  passed. No branch is deleted and none of those PRs is merged separately.

No functional, capture or dependency bytes change in this evidence follow-up.
The jj-store ledger owns its 933 regenerated references, final strict results
and cache-identity proof. Local Firefox launch limitations are environment
specific; the hosted three-browser native proof is separate. Registry
publication, immutable release tagging and human visual review remain pending.
