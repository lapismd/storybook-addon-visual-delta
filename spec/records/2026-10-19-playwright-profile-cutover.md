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

The publication is in progress. No invented digest or declared browser version
is used as qualification. The selected artifact must report the approved source
and unchanged lock SHA-256
`7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`.
Image manifest/ARM64 digests, browser versions and font hash come from successful
native evidence, followed by anonymous registry verification and a compare-only
ARM64 canary through all required PR jobs before source integration.

Current baseline files and thresholds are retained. Any rendering mismatch is a
failure to investigate, not authorization to refresh snapshots. The separate
two-advisory npm audit and clean-consumer/public-package gates remain open.
