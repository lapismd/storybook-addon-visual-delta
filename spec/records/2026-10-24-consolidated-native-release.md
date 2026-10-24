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
