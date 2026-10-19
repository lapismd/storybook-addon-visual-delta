# Approved Playwright browser profile cutover

## Authority and source

The user explicitly approved CI-image publication for source
`2fa7976031bd24cbfa646596c22586c1ad6992e7`, audit tag
`node24.15.0-pnpm10.32.1-playwright1.62.1-r1` and the existing generic `latest`
alias. Approval covers Linux AMD64/ARM64 CI images, native smoke and the reviewed
browser-profile cutover. It does not approve npm publication or an audit exception.

Producer PR #29 passed all five required checks at
`939dbbb165e680a936ca6205f4a97e95d1dcc9d4` and merged as
`e773f28fb05bb051128aa1d9d865bfcc88ae7b96`. Runs `39318830447` and
`39318830348` retain the hosted evidence. The dependency PR head and its lock
were rechecked before dispatch; the approved audit tag was absent.

Image workflow run `39320101643` dispatches from the reviewed main producer
while selecting the exact approved candidate. The pending `ci-image` environment
identity was read back before its review was approved under the user's explicit
authorization. Both source verification and the fresh-tag guard pass. Build and
native qualification are recorded below before any profile lock is promoted.

## Health-check regression

The runner doctor also contained a separate literal Playwright 1.61.1 probe.
VD-CAP-006 now explicitly requires the probe to follow its selected profile.

- The first new test used a native-module mock and stalled during collection.
  Stopped only that invocation's exact identified PIDs (72994/72975/72912).
  It exits 143 and provides no passing or failing test count.
- Replaced the harness with a disposable fake Docker executable on the test's
  PATH, preserving normal process execution and recording probe arguments.
- Before repair, `corepack pnpm@10.32.1 exec vitest run
src/node/capture-runner-doctor.spec.ts` fails 2/2 cases. Both show the stale
  1.61.1 literal despite selected 1.62.1 and 1.63.0 profile versions.
- Replaced only that literal with the canonical profile's Playwright version.
  The exact after-run plus `src/node/capture-runner.spec.ts` and
  `src/shared/capture-profile.spec.ts` pass: 25 tests across three files.
  `corepack pnpm@10.32.1 check:architecture` passes with no budget growth.
  Complete package/hosted qualification follows the actual profile lock.

## Publication and cutover results

The build in publication run `39320101643` succeeded, publishing the approved
R1 tag and `latest`, but both native smokes failed at Firefox HOME ownership.
No profile was emitted. Source repair PR #30 at
`7e922c6f0bcfd10d9483499359faa8720b9f6d76` passed all five required checks in
runs `39324439150` and `39324439079` and merged as
`ce7676d502474a7dd02f889722f73a4ff2530b9e`. It restores step HOME and adds
read-only verification; see the separate native recovery record.

Recovery run
[`39325220413`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/39325220413)
passes identity inspection, native x64 smoke, native ARM64 smoke and profile
assembly against the existing published bytes. No image is rebuilt or replaced.
Downloaded artifacts confirm the approved source and unchanged lock SHA-256
`7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`.

- Index: `sha256:d96587d3f3eed2d1cbe63593566813b5f255576a28f27595dec6bb35e9936b71`.
- ARM64: `sha256:661cb2485c34efc928a3ab2b64b867ee02908a71145f6a2d8a61d6febfb8abc4`.
- Native browsers: Chromium 151.0.7922.34, Firefox 153.0, WebKit 26.5.
- Font hash: `sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3`.
  Hashing the retained 55-entry manifest independently reproduces it.
- Profile browser inventory equals the native inventory. Node 24.15.0,
  npm 12.0.2, pnpm 10.32.1 and mdBook 0.5.4 are reported by the image.

Normal merges retain published PR history and newer main source. The coordinated
candidate updates the runtime profile, guard tests and all five canonical ARM64
job containers together. The producer's existing metadata helper keeps its
separately verified old Node image digest; historical records are retained.
Before pin changes on the combined candidate, `node --test
scripts/check-ci-image.spec.mjs` passes 26/27 with only the intended positive pin
check failing. The doctor/profile focused suite still passes 25/25. Complete
candidate verification and the required hosted ARM64 canary follow below.

Current baseline files and thresholds are retained. Any rendering mismatch is a
failure to investigate, not authorization to refresh snapshots. The separate
two-advisory npm audit and clean-consumer/public-package gates remain open.

## Final candidate checks

- `node --test scripts/check-ci-image.spec.mjs scripts/ci-image-publication-policy.spec.mjs`:
  35/35 pass after the measured pins, including the repaired positive guard.
- `corepack pnpm@10.32.1 check:architecture`: pass, no budget growth.
- The first full spec command passed 94/94 scripts, architecture, image contract
  and mdBook but its default `@-` spec-first base was ambiguous in the normal
  two-parent merge. `corepack pnpm@10.32.1 spec:check --base main --head @`
  passes all six lanes with explicit comparison scope, matching PR CI's model.
- `corepack pnpm@10.32.1 typecheck`: pass.
- `corepack pnpm@10.32.1 test`: 553 tests / 117 files pass.
- `corepack pnpm@10.32.1 build:node` and `publint`: pass. Publint's existing
  optional repository URL scheme suggestion remains non-blocking.
- Actionlint finds no new workflow issue. It reports SC2016 on the unchanged npm
  auth placeholder line; the exact main workflow reproduces it. That single-quoted
  literal intentionally defers token expansion to npm. No credential behavior or
  publication gate is changed for this informational diagnostic.
- Downloaded native artifacts were moved under ignored `.cache/verification`;
  the committed candidate contains no local artifacts or baseline modifications.
- Hosted PR CI qualifies the exact pushed candidate; no local browser run is
  substituted for its cold panel/manager/all-browser ARM64 acceptance.

## Hosted candidate formatting regression

At head `0900233c33ad5cdf62956441faf5fc923303f4ec`, hosted spec run
`39325798630` passes 93/94 script tests. Architecture test `passes the current
repository tree against its baseline` rejects the profile spec growing from
49 to 51 counted lines. A final formatter had wrapped one existing assertion
after the local architecture run. Restore that assertion's original layout;
retain every assertion and the existing 49-line budget. No baseline or product
behavior changes. Focused architecture and full spec qualification are rerun
after this correction, then the exact pushed head must pass hosted checks.

The correction passes the exact architecture regression (1/1), profile unit
suite (2/2), and all six spec lanes (94/94 scripts). The prior package run
already passed 553 tests; only the existing assertion's whitespace and its
verification record changed. Hosted CI is rerun on the final corrected head.
