# Combined Playwright image candidate

The dependency candidate combines its existing source
`a537526d369533ffb5c24cdd62cdb786ae3d1583` with producer bootstrap PR #29,
`939dbbb165e680a936ca6205f4a97e95d1dcc9d4`, using a normal merge change.
No published source history is rewritten. Canonical source changes are owned
by those two reviewed parents; this record preserves the combined acceptance
and publication boundary without changing a product contract.

The selected graph uses Playwright/runtime test 1.62.1, Storybook 10.5.10,
Svelte 5.56.10, Node types 26.3.0, and the earlier security repairs. Lock SHA-256
remains `7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`.

The protected image publisher can build this full exact source after #29 lands
on main and separate image-publication approval is granted. Proposed immutable
audit tag: `node24.15.0-pnpm10.32.1-playwright1.62.1-r1`. It builds Linux AMD64
and ARM64, publishes only the CI image/audit tag and existing generic `latest`
alias, verifies both native architectures and emits measured browser/font/source
and lock provenance. Required reviewer `stevejuma` and main-only deployment are
configured. No deployment approval or image dispatch has been performed.

The current canonical image/profile and checks still qualify 1.61.1. After the
reviewed image is built and smoke passes, lock its actual digests, browser and
font versions, update the exact package pin guard, then canary and re-run the
complete required browser jobs. Do not invent digests, install browsers ad hoc,
skip checks or update visual baselines to hide a failure.

Combined-tree verification:

- `CI=true corepack pnpm@10.32.1 install --frozen-lockfile --ignore-scripts`:
  passed for the unchanged dependency candidate lock.
- `corepack pnpm@10.32.1 typecheck`: passed.
- `corepack pnpm@10.32.1 test`: all 551 tests in 116 files passed again on the
  combined tree.
- `corepack pnpm@10.32.1 spec:check`: canonical validation passes; script tests
  remain 87/88 with only the existing positive image-pin assertion failing for
  the two 1.62.1 pins. No check is suppressed.
- Explicit `spec-validator first` from original main to this candidate and
  Markdown lint of this record pass. The owning candidate paragraphs clarify
  that the newly admitted producer bootstrap does not qualify the browser cutover.
- `jj new` combined the two public parents without conflicts. `jj resolve --list`
  exits 2 with "No conflicts found"; this is not a merge failure.

Hosted source checks and public image qualification remain separate. The npm
exception and npm publication still need independent decisions. Local Node is
26.9.0; the source workflow continues to use Node 24.15.0.
