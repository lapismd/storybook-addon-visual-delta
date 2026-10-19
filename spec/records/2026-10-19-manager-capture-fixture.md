# Captured comparison fixture profile qualification

## Before state and unchanged contracts

The approved 1.62.1 image passes both native smokes in run `39325220413`.
Candidate `e1638d78701ded66383ecb15c1c423104f67159b` passes specification,
package, panel and all-three-browser acceptance, but manager run `39326146683`
passes 52, skips 1 and fails 2 captured-actual presentation tests.
Both time out waiting for `#visual-delta-captured-actual`.

The committed example sidecar records the historical 1.61.1 profile. Production
`loadPlaywrightDiffResult` rejects its different profile exactly as required.
This is a fixture mismatch, not authorization to relabel historical evidence or
relax freshness. VD-UI-003, VD-UI-005 and VD-CAP-006 remain unchanged. Existing
canonical baseline-cutover gaps and baseline approval remain open.

Extract those two presentation scenarios into their own manager file under
unchanged VD-ARCH-006 and lower the old file's budget. Supply a clearly synthetic
current-profile sidecar through test-only routing. Retain the original PNGs,
hashes and captured result on disk. Add a third scenario proving the historical
profile still takes the baseline-only fallback. Production hydration and all
existing assertions remain unchanged.

## Validation

The owning exact browser targets and cold qualification are recorded below.
No baseline update, image rebuild, audit exception or npm release is performed.

- Pulled the approved immutable ARM64 child image. No browser installation or
  image rebuild. A tracked-source archive is extracted into disposable `/work`;
  it links the image-owned frozen Linux dependencies, with HOME `/root` and CI.
- Cold before: `pnpm test:manager --grep "shows a hydrated actual|fits captured comparison panes"`
  in the unmodified source archive reproduces both failures (2/2). The container
  and its test-generated files are removed after exit.
- Cold after: `pnpm test:manager tests/manager-captured-actual.spec.ts` in a fresh
  container passes all three scenarios in 14.7s, including rejection of the
  untouched historical profile. Both isolated containers are removed.
- `corepack pnpm@10.32.1 check:architecture` and `typecheck`: pass. Extraction
  lowers the manager spec budget from 2071 to 1891 counted lines. The new file
  remains below its 500-line test limit.
- Initial full spec run rejects one duplicate blank line in the new canonical
  paragraph (MD012). Removed that blank line. Full `spec:check` then passes all
  six lanes, including all 94 repository scripts and spec-first.
- No portable runtime implementation changes; prior local 553 units remain
  separate evidence. Exact-head hosted package/spec/panel/browser/manager CI
  must still pass before protected merge. No stale-evidence check is disabled.
