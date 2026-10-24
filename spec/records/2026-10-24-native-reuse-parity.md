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
