# Native capture reuse parity

Requirements: VD-RUN-007/008 and VD-BASE-005/009. Enclosing change: uyuyzvtu.

## Problem and repair

Native profiles always emitted a null font fingerprint, disabling cached actuals
and passing affected exclusions. Native workers also omitted existing derived
artifacts from their temporary workspace. Finally, affected passing-cache keys
omitted runtime profile identity, allowing a font/browser/OS change to skip a
story once native reuse was enabled.

The built-in adapter measures registered CoreText faces and their resolved font
files on macOS, with system_profiler fallback. Linux measures Fontconfig font
files, active fallback configuration and font-related environment. Content
hashes detect same-size/timestamp-preserving font edits. Missing, malformed,
unreadable or timed-out evidence retains capture with reuse disabled. The
macOS registry probe measured 0.33 seconds here versus 18 seconds for the
fallback inventory; file contents are still hashed in full.

Native jobs stage only the active profile's actuals and sidecars. Linked or
unreadable inputs cause individual misses without discarding valid neighboring
capture sets. Staged copies are independent; unsafe links cannot expose data
outside the profile. Full profile identity now enters affected configuration
keys as well as existing actual/build guards. Evidence is measured once per
plan and frozen for the package worker. Existing Docker identities, PNG paths,
comparison thresholds, baseline mutation gates and review tags are unchanged.

## Regression evidence

- `pnpm exec vitest run src/node/native-capture-reuse.spec.ts`: before,
  2 failures and 1 pass; measured profile/cache reuse now passes.
- `pnpm exec vitest run src/node/native-affected-reuse.spec.ts`: after repairing
  the synthetic graph's namespace, 3 real failures and 2 passes reproduce
  font/browser/OS stale skips. All 5 now pass with profile-aware cache keys.
- Initial public native acceptance failed its first cached-actual assertion;
  direct host reuse succeeded, proving the worker's missing artifact inputs.
  Staging those inputs repairs the public worker. The first no-op assertion
  expected a guessed CLI string; it now checks the actual exact public output,
  `Up to date · 1 unchanged`, without changing scope or policy.
- An early unit probe used an incomplete built-in-module mock and was stopped;
  mocking named and default exports avoids invoking real font tools in unit
  fixtures. No production readiness limit or timeout was changed.

## Completed local validation

- Focused font/profile/staging/transaction/affected/cached-actual boundary:
  63 tests across 8 files pass.
- `VITEST_MAX_WORKERS=4 pnpm check`: 617 tests across 130 files, both type
  configurations, all 7 specification lanes, Node build and publint pass.
  The only lint suggestion is the inherited repository URL spelling.
- `pnpm test:native` source acceptance passes Chromium primary and mode PNGs,
  strict comparisons, complete-set reuse, corruption recovery, changed-baseline
  recomparison, unchanged all/affected runs, fresh capture and interactions.
- The exact final tarball passes public-worker native acceptance with Chromium
  and WebKit, including independent per-browser reuse after one target is
  corrupted and complete primary/mode/interaction sets.
- `STORYBOOK_PORT=25410 pnpm test:panel`: cold build and 13 browser cases pass.
  The existing local launcher left detached servers during teardown; after all
  cases completed, the owned 25413/25414/25415 processes were stopped and the
  command exited 0. The launcher and server implementation are unchanged.
- `pnpm release:intent` passes with a patch Changeset. `pnpm pack` succeeds;
  the executable public worker and Node exports are exercised from the archive.

Final inspected archive SHA-256: `d59d01236e455b4438df7ca3d14f7d6d0a9c333260ecdec334a272dbd84723f3`.
Toolchain: native macOS ARM64 Darwin 27, Node 26.9.0, installed project
Playwright 1.62.1, Chromium 151.0.7922.34 and WebKit 26.5.

## Consumer acceptance and remaining scope

jj-store validates the archive through an ignored pnpm hook while its tracked
manifest and lock retain registry ranges. Its pre-existing Design Core 0.6.0
packed validation remains intact. Baseline regeneration and capture-ID/cache
checks are recorded in the consumer's own M4 evidence, separately from package
qualification.

Local Firefox still fails launch with sandbox-extension/compositor diagnostics;
WebKit and Chromium launch. The Docker daemon is unavailable. Fresh hosted
Linux/macOS and canonical qualification is pending the upstream draft PR. No
image, npm version, release tag or package publication is authorized by this
source slice. The patch Changeset records release intent; historical baseline
review and standalone consumer story blockers remain separate.

## Consumer-discovered staged baseline identity

The first packed consumer verification regenerated 933 available baselines and
proved reuse of all 933 actuals with unchanged IDs, timestamps and hashes.
Fresh and cached strict comparisons both retained 18 mismatches, four changes
within tolerance and 911 identical results. However, the subsequent affected
dry-run selected 1046 stories and excluded none despite 915 passing cache rows.

The native worker staged snapshots outside the project but left original PNGs
under `tests/visual`. Those originals entered built-in global inputs, while
host planning correctly excluded its snapshot directory. Thus identical inputs
produced different host/worker render and passing fingerprints. The isolated
`native-affected-reuse.spec.ts` regression reproduced one failure with five
passes. The repaired focused configuration/affected lane passes 33 tests.

Snapshot resolution now exposes the logical source directory independently of
the staged read directory. Both remain story-owned baseline inputs rather than
global capture inputs. The predicate resolves directories once per plan; byte
hashing and changed-baseline selection remain unchanged. Native public acceptance
now uses the consumer-shaped `tests/visual/storybook.spec.ts-snapshots` path.
Path helpers and fixture path construction are extracted to reduce existing
architecture budgets. An initial full check caught two file-growth limits;
those extractions repair the limits without raising any recorded budget.

Final package, archive, hosted and consumer qualification for this correction
is recorded below after execution. Previously recorded archive identity and
hosted qualification apply to the initial patch, not this later correction.

The first consumer-shaped packed run still failed its cached-source assertion:
Playwright received the physical stage path as an explicit option and lost the
source directory during fingerprinting. The native worker now freezes
`VISUAL_DELTA_SOURCE_SNAPSHOT_DIR` alongside its physical staged read path. The
regression additionally compares CLI and Playwright-shaped options directly.

Final correction validation:

- Exact focused configuration/affected regression: 33 tests pass.
- `VITEST_MAX_WORKERS=4 pnpm check`: 618 unit tests across 130 files, types,
  all seven spec lanes, Node build and publint pass.
- Final archive native acceptance with Chromium and WebKit passes the entire
  capture/reuse matrix, including `tests/visual` host affected no-op, modes,
  interactions, corruption, baseline edits, strict missing/mismatch and fresh.
- Cold `STORYBOOK_PORT=25410 pnpm test:panel`: all 13 pass. As in the initial
  run, stopping only the owned detached 25413/25414/25415 servers after case
  completion lets the unchanged local launcher finish successfully.
- Final correction archive SHA-256:
  `ba97613fa700ea602f7c14c4f7470c81272c817a1f25685aab2947e0343ad041`.

The consumer installs this archive through the same documented ignored pnpm
hook, with 810 source/dist files byte-verified, its original registry manifest
and lock restored, and packed Design Core 0.6.0 preserved. Its next fresh and
cached runs requalify the corrected fingerprints; no baseline is overwritten
again. Final hosted results and consumer outcomes remain in the consumer ledger.

The initial PR 47 merged as `c1b21a5501666489074361f841e9361d17df3f57`
while consumer validation continued. The staging correction is a separate
verified follow-up change on that main revision, with its own patch Changeset;
the merged branch is not republished or rewritten. npm still reports 0.1.0.
