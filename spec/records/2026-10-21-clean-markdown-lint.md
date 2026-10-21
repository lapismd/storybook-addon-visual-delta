# Clean audit with unchanged Markdown lint coverage

Date: 2026-10-21. Revision: enclosing Jujutsu change. Publication remains unapproved.

The cold Linux runner fix is merged by PR #35 at
`cc3453fcb9ea001def8a1bc85780d7b3089a2a10`. All six source checks pass, including
real non-root ownership cleanup. The manager lane's first attempt has 53 passes,
two navigation/network-idle timeouts and one skip; an unchanged-source rerun
passes 55 with one skip. No assertion, timeout or baseline is changed. The
merged source tree equals the tested head `3ad36b98` (tree `51df1edd`).

The remaining high braces finding comes solely from development-only
markdownlint-cli2's glob graph. Replace that driver with maintained
markdownlint-cli 0.49.1, already used in Mira. Retain exactly the previous source
targets and rule settings in `.markdownlint.json`: defaults on, MD013 and MD060
off, MD024 sibling-only. Generated books stay outside `spec/src/**/*.md`.

The shared validator's former CLI2-specific adapter is replaced with an explicit
required Markdown-lint lane, not removed from specification checks. Both direct
`spec:lint` and aggregate `spec:check` run the same command. A real CLI regression
checks accepted long lines/unaligned tables, rejected missing heading separation,
allowed duplicate headings under different parents and rejected sibling
duplicates. The Changesets reader regression is also added to the configured
script-test lane so it continues running in CI.

## Commands and results

- Frozen Corepack pnpm 10.32.1 installation passes after lockfile refresh.
- First post-driver audit removes braces but exposes two moderate parser findings
  in js-yaml 5.2.3 and smol-toml 1.7.2. Patch only that driver's YAML/TOML
  dependencies within majors 5/1. The subsequent full `pnpm audit` has zero
  findings; no exception, ignore or audit-level filter is added.
- Both real-CLI lint and single-package Changesets reader tests pass. Direct
  Markdown lint passes across the original complete source scope.
- `corepack pnpm@10.32.1 spec:check` passes seven lanes and 154 script tests,
  retaining architecture, CI-image contract, mdBook and spec-first checks.
- Architecture passes. Release intent passes one public change and one explicit
  empty maintenance Changeset; the existing cold-runner patch still proposes
  0.0.9 in Version Packages PR #36. No version/changelog is edited by hand.

This development-only slice changes no capture, browser, baseline or runtime
contract. Full required hosted CI remains pending until it completes on the
exact PR candidate. Source publication and normal release approval remain
separate. The consumed 0.0.8 exception remains immutable and is not reused.

The goal is a clean 0.0.9 release candidate before resuming Mira's real strict
comparison. Mira core 0.1.0 and dependent 0.0.3 proposals, public-consumer checks,
Desktop distribution and Deno retirement remain separate pending gates.
