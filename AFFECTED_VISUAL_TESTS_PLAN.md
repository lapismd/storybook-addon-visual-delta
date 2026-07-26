# Affected visual tests

This file tracks the TurboSnap-style affected-run implementation for Visual
Delta. The local cache is an optimization only; full visual runs remain the
safety gate.

## Scope

- Generate Storybook `preview-stats.json` alongside static builds.
- Trace changed inputs through Storybook's reverse dependency graph.
- Cache per-story passing fingerprints in `.cache/visual-delta/`.
- Add affected/all/dry-run/explain CLI selection.
- Expose affected selection and summaries through middleware, the panel, and
  Storybook's global Testing Module.
- Fall back to all visual stories whenever tracing is incomplete or a
  high-risk input changes.

## Safety boundaries

- `pnpm test:visual` and `pnpm checks` always run the complete visual suite.
- Missing, stale, invalid, or unsupported graph/cache data selects all stories.
- Storybook configuration, preview dependencies, capture infrastructure,
  Playwright configuration, package metadata, lockfiles, configured static
  assets, and configured externals select all stories.
- `untraced` globs are optional and reduce coverage when enabled.
- `skip-visual` stories are never selected.
- Committed visual baselines are not updated by this work.

## Progress

- [x] Baseline-history slice landed before this work began.
- [x] Dedicated Jujutsu workspace created from the landed revision.
- [x] Affected graph, fingerprints, cache, and planner.
- [x] CLI and package scaffolding.
- [x] Middleware request/response integration.
- [x] Panel and Testing Module affected scope.
- [x] Focused unit, Storybook, Playwright, build, and dry-run validation.
- [ ] Full `pnpm test:visual` and `pnpm checks` safety gates.

## Validation status

- Unit tests: 111 files and 541 tests passed.
- Changed Visual Delta stories pass focused interaction and accessibility runs.
- Visual Delta panel Playwright: 36 tests passed.
- Static Storybook build: 2,826 modules, 111 visual story files, and 277
  runnable stories in `preview-stats.json`.
- The affected CLI and middleware endpoint both report the conservative
  full-suite fallback and its changed inputs.
- `pnpm test:visual` exercised the full suite without updating snapshots:
  194 passed and 85 existing AI Chat stories failed because they have no
  committed baseline PNG.
- `pnpm checks` reaches the broad Storybook run, where the landed
  baseline-history story has one existing color-contrast violation (3.97:1).
  Fixing that visual design needs separate approval and is outside this slice.
