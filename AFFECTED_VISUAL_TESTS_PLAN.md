# Affected visual tests

> Historical implementation record. Use the
> [`Visual Delta system specification`](./spec/src/index.md) for the normative
> contract.

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
- Visual baselines change only with explicit approval. The approved follow-up
  added the 85 previously missing AI Chat baselines without modifying an
  existing PNG.

## Progress

- [x] Baseline-history slice landed before this work began.
- [x] Dedicated Jujutsu workspace created from the landed revision.
- [x] Affected graph, fingerprints, cache, and planner.
- [x] CLI and package scaffolding.
- [x] Middleware request/response integration.
- [x] Panel and Testing Module affected scope.
- [x] Focused unit, Storybook, Playwright, build, and dry-run validation.
- [x] Approved baseline-history contrast correction and 85 missing AI Chat
      baselines, using collision-safe nested story paths.
- [x] Full `pnpm test:visual` and `pnpm checks` safety gates.

## Validation status

- Unit tests: 111 files and 542 tests passed.
- Storybook tests: 151 files and 417 tests passed, including the approved
  baseline-history contrast correction.
- Visual Delta panel Playwright: 36 tests passed.
- AI Chat browser acceptance: 2 tests passed from a cold Storybook start after
  waiting for Storybook's `storyFinished` signal.
- Static Storybook build: 2,943 modules and 277 runnable stories represented in
  `preview-stats.json`.
- An unchanged affected dry run reports `Up to date · 277 unchanged`.
- `pnpm test:visual` exercised the full suite without updating snapshots:
  279 passed.
- `pnpm checks` passed on the workspace-isolated Storybook/Visual Delta ports
  `9309`/`9310`.
