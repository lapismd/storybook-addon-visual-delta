# Visual Delta verification

This reference maps every stable requirement to implementation evidence, records the current conformance audit, and defines validation commands. A passing test is evidence for the specification, not permission to redefine it.

## Conformance states

The audit uses:

- **Conforming**: current implementation and focused evidence satisfy the requirement family
- **Partial**: some paths conform, but a declared path lacks complete behavior or coverage
- **Gap**: current implementation contradicts or omits the requirement
- **Not run**: evidence exists but was not executed in the recorded audit

A conformance claim requires implementation inspection and proportionate automated evidence. Browser-facing lifecycle claims require real browser acceptance.

## Requirement traceability

The following table names the primary evidence. Related tests can add confidence without replacing these anchors.

| Requirements                                                                                            | Primary implementation evidence                                                                                                                                                                                                                                                | Primary automated evidence                                                                                                                                                                                                                                                          | Audit state                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `VD-ARCH-001`, `VD-ARCH-002`, `VD-ARCH-003`, `VD-ARCH-004`, `VD-ARCH-005`                               | `src/manager.tsx`, `src/preview.ts`, `src/node/middleware.ts`, `src/node/capture-runner.ts`, `src/node/compare-story.ts`, `src/node/visual-artifacts.ts`, `src/node/cached-actual.ts`, `src/playwright/suite.ts`, `src/node/run-hub.ts` | Artifact-path, cached-actual, recursively dereferenced external snapshot staging, capture-runner, compare-story, portable-host, runtime-instance, reload, and panel browser tests | Conforming |
| `VD-CONF-001`, `VD-CONF-002`, `VD-CONF-003`, `VD-CONF-004`, `VD-CONF-005`, `VD-CONF-006`, `VD-CONF-007`, `VD-CONF-008` | `src/constants.ts`, `src/visual-diff-sidecar.ts`, `src/shared/project-defaults.ts`, `src/node/project-config.ts`, `src/node/options.ts`, `src/node/capture-runner.ts`, `src/preview/init.ts`, `src/shared/story-config.ts`, `src/shared/capabilities.ts`, `src/shared/manager-options.ts`, `src/panel/settings.ts`, `src/panel/image-comparison.ts`, `src/panel/load-playwright-diff.ts`, `src/panel/BaselineHistoryView.tsx`, `src/panel/ConfigurationPanel.tsx`, `src/playwright/config.ts`, `src/playwright/compare-pixels.ts`, `src/shared/environments.ts`, `src/shared/capture-profile.ts` | `src/shared/project-defaults.spec.ts`, `src/playwright/compare-pixels.spec.ts`, `src/node/playwright-threshold.spec.ts`, `src/panel/image-comparison.spec.ts`, `src/panel/settings.spec.ts`, `src/panel/ConfigurationPanel.spec.tsx`, `src/panel/BaselineHistoryView.spec.tsx`, `src/node/project-config.spec.ts` (capture workspace ignore validation and round trip), `src/node/capture-runner.spec.ts`, `src/node/options.spec.ts`, `src/shared/capabilities.spec.ts`, `src/playwright/config.spec.ts`, `src/shared/environments.spec.ts`, `src/shared/capture-profile.spec.ts`, `src/node/story-source.spec.ts` | Conforming |
| `VD-API-001`, `VD-API-002`, `VD-API-003`, `VD-API-004`, `VD-API-005`, `VD-API-006`, `VD-API-007`, `VD-API-008`, `VD-API-009`, `VD-API-010`, `VD-API-011` | `package.json`, `scripts/check-npm-release.mjs`, `scripts/prepare-cli-bin.mjs`, `src/node/cli.ts`, `src/node/doctor.ts`, `src/node/init-scaffold.ts`, `src/node/middleware.ts`, `src/node/capture-runner.ts`, `src/node/compare-story.ts`, `src/node/baseline-migration.ts`, `src/node/story-facts.ts`, `src/shared/compare-story-types.ts`, `src/shared/story-facts.ts`, `src/manager/run-visual.ts`, `src/manager/visual-filters.ts`, `src/node/run-hub.ts`, `src/panel/chromium-capture.ts` | Doctor installation, inventory, read-only, output, CLI, capture-runner, packed-source worker detection, TypeScript package-manifest compiler resolution, ANSI-preserving compare-story log-stream, explicit-target comparison, migration, story-facts, filter, run-hub, executable package-bin, package dry-run, and host middleware tests | Conforming |
| `VD-BASE-001`, `VD-BASE-002`, `VD-BASE-003`, `VD-BASE-004`, `VD-BASE-005`, `VD-BASE-006`, `VD-BASE-007`, `VD-BASE-008` | `src/node/snapshot-paths.ts`, `src/node/visual-artifacts.ts`, `src/shared/baseline-url.ts`, `src/node/baseline-vite-plugin.ts`, `src/node/story-facts.ts`, `src/node/visual-sidecars.ts`, `src/manager/run-visual.ts`, `src/playwright/suite.ts`, `src/preview/normalize.ts` | Artifact path, version 4 result, browser-only path, migration, story-facts, preview, manager, host baseline, interaction tests, and browser-matrix inspection of `.visual-delta/artifacts` | Partial: gaps VD-GAP-001 and VD-GAP-002; committed PNG cutover separately gated |
| `VD-CAP-001`, `VD-CAP-002`, `VD-CAP-003`, `VD-CAP-004`, `VD-CAP-005`, `VD-CAP-006`, `VD-CAP-007` | `src/playwright/config.ts`, `src/playwright/readiness.ts`, `src/playwright/suite.ts`, `src/node/capture-runner.ts`, `src/node/compare-story.ts`, `src/panel/capture.ts`, `src/preview/capture-ready.ts`, `src/preview/render-lifecycle.ts`, `src/shared/capture-target.ts`, `src/shared/preview-layout.ts`, `src/shared/geometry-mismatch.ts`, `src/shared/failure-mode.ts`, `scripts/capture-example-baselines.mjs` | `src/playwright/config.spec.ts`, `src/playwright/write-diff-artifacts.spec.ts`, `src/node/capture-runner.spec.ts`, `src/node/compare-story.spec.ts`, `src/shared/failure-mode.spec.ts`, `src/shared/baseline-readiness.spec.ts`, `src/shared/capture-target.spec.ts`, `src/shared/preview-layout.spec.ts`, `src/shared/geometry-mismatch.spec.ts`, `src/preview/capture-ready.spec.ts`, `src/preview/render-lifecycle.spec.ts`, `src/panel/capture.spec.ts`, responsive manager geometry acceptance, `scripts/capture-example-baselines.spec.mjs`, `pnpm test:browsers`, overlay browser tests | Partial: gap VD-GAP-003 |
| `VD-UI-001`, `VD-UI-002`, `VD-UI-003`, `VD-UI-004`, `VD-UI-005`, `VD-UI-006`, `VD-UI-007`, `VD-UI-008`, `VD-UI-009`, `VD-UI-010`, `VD-UI-011`, `VD-UI-012`, `VD-UI-013` | `.storybook/preview.ts`, `src/panel/Panel.tsx`, `src/panel/PanelView.tsx`, `src/panel/PanelStatusBar.tsx`, `src/panel/EnvironmentSplitButton.tsx`, `src/panel/environment-selection.ts`, `src/panel/VisualDeltaHeader.tsx`, `src/panel/BaselineAccordion.tsx`, `src/panel/ModeSelector.tsx`, `src/panel/PlacementPad.tsx`, `src/panel/CompareZoomControl.tsx`, `src/panel/hooks.ts`, `src/panel/settings.ts`, `src/panel/capture.ts`, `src/panel/capture-diagnostics.ts`, `src/panel/load-playwright-diff.ts`, `src/preview/init.ts`, `src/preview/normalize.ts`, `src/preview/overlay.ts`, `src/preview/capture-ready.ts`, `src/panel/usePlaySteps.ts`, `src/manager/review-layout.ts`, `src/manager/run-visual.ts`, `src/manager.tsx`, `src/manager/VisualTestProvider.tsx`, `src/manager/VisualFiltersMenu.tsx`, `src/manager/visual-filters.ts`, `src/shared/overlay-session.ts`, `src/shared/baseline-image-readiness.ts`, `src/shared/compare-zoom.ts`, `src/shared/preview-chip.ts`, `src/shared/capabilities.ts`, `src/shared/ansi-log.ts` | Panel component tests including `src/panel/ModeSelector.spec.tsx`, `src/panel/PlacementPad.spec.tsx`, `src/panel/CompareZoomControl.spec.tsx`, `src/panel/capture-diagnostics.spec.ts`, `src/panel/settings.spec.ts`, `src/panel/environment-selection.spec.ts`, `src/panel/PanelStatusBar.spec.tsx`, `src/shared/ansi-log.spec.ts`, `src/manager/review-layout.spec.ts`, `src/manager/VisualFiltersMenu.spec.tsx`, `src/manager/visual-filters.spec.ts`, `src/preview/init.spec.ts`, `src/preview/normalize.spec.ts`, `src/preview/overlay-image-error.spec.ts`, `src/shared/overlay-session.spec.ts`, `src/shared/baseline-image-readiness.spec.ts`, `src/shared/preview-layout.spec.ts`, `src/shared/preview-chip.spec.ts`, `src/shared/capabilities.spec.ts`, embedded placement reset, diagonal converging Fit icon and reduced-motion styling, icon-only zoom tooltip coverage, placement-pad-sized column split mode preview/lightbox, centered menu-thumbnail and single-choice image-only coverage, ANSI-running Panel Shell and panel acceptance, compare-story stream preservation with immediate sidecar capture diagnostics independent of artifact hydration, compare-view and preview lifecycle tests, manager story-switch, authoritative mode selection and globals-remount persistence, persisted overlay/zoom navigation and reload, delayed image paint, responsive canonical-width Fit, fingerprinted and labelled actual-versus-baseline hydration with captured-mode placement controls, teaching-fixture mutation gating, long-accordion geometry and scroll acceptance, mobile review-drawer restoration, and manager/panel profile-browser selector, exact-overlay, dynamic browser-filter, coverage-gap, persistence, and footer-geometry coverage | Partial: gap VD-GAP-005                 |
| `VD-RUN-001`, `VD-RUN-002`, `VD-RUN-003`, `VD-RUN-004`, `VD-RUN-005`, `VD-RUN-006`, `VD-RUN-007` | `package.json`, `playwright.config.ts`, `tests/visual/storybook.spec.ts`, `src/shared/action-scope.ts`, `src/node/static-build.ts`, `src/node/affected-visual-tests.ts`, `src/node/capture-runner.ts`, `src/node/visual-test-cli.ts`, `src/node/compare-story.ts`, `src/playwright/suite.ts`, `src/node/run-hub.ts`, `src/manager/run-visual.ts`, `src/manager/VisualTestProvider.tsx`, `src/manager/visual-test-module-prefs.ts`, `src/manager/VisualTestModuleUI.tsx`, `src/panel/Panel.tsx` | Package self-test Playwright and stats-generation configuration, exact-baseline capture-selection tests, `scripts/package-storybook-build.spec.mjs`, `src/shared/action-scope.spec.ts`, `src/node/static-build.spec.ts`, `src/node/affected-visual-tests.spec.ts`, `src/node/affected-plan-cache.spec.ts`, `src/node/capture-runner.spec.ts`, `src/node/visual-test-cli.spec.ts`, `src/node/compare-story.spec.ts`, `src/node/run-hub.spec.ts`, `src/manager/run-visual-reconnect.spec.ts`, `src/manager/review-updates-from-results.spec.ts`, `tests/manager.spec.ts` | Conforming                              |
| `VD-MUT-001`, `VD-MUT-002`, `VD-MUT-003`, `VD-MUT-004`, `VD-MUT-005`, `VD-MUT-006`, `VD-MUT-007`        | `src/shared/interaction-capture.ts`, `src/node/baseline-cli.ts`, `src/node/middleware.ts`, `src/node/delete-baseline.ts`, `src/node/story-source.ts`, `src/node/doctor.ts`, `src/node/change-set-store.ts`, `src/manager/run-visual.ts`, `src/panel/Panel.tsx`, `src/manager/AcceptSplitButton.tsx`, `scripts/ui-generator/pipeline/visual-interaction-update.ts` | `src/shared/interaction-capture.spec.ts`, `src/node/delete-baseline.spec.ts`, `src/node/story-source.spec.ts`, `src/node/init-scaffold.spec.ts`, `src/node/doctor.spec.ts`, `src/node/change-set-store.spec.ts`, `src/manager/review-updates-from-results.spec.ts`, host middleware and writer tests | Conforming |
| `VD-VCS-001`, `VD-VCS-002`, `VD-VCS-003`, `VD-VCS-004`, `VD-VCS-005`, `VD-VCS-006`                      | `src/node/baseline-history-vcs.ts`, `src/node/change-set-store.ts`, `src/node/change-set-vcs.ts`, `src/shared/workflow-config.ts`                                                                                                                                              | `src/node/baseline-history-vcs.spec.ts`, `src/node/change-set-store.spec.ts`, and `src/node/change-set-vcs.spec.ts`; real Jujutsu fixtures are skipped only when `jj` is unavailable, while mock-based adapter coverage always runs | Conforming                              |
| `VD-HOST-001`, `VD-HOST-002`, `VD-HOST-003`, `VD-HOST-004`, `VD-HOST-005`, `VD-HOST-006`, `VD-HOST-007`, `VD-HOST-008`, `VD-HOST-009` | UI `.storybook/main.ts` + `visual-delta-preset.ts`, package `.storybook/main.ts` self-test catalog (sibling / packaged fixture mounts), `playwright.panel.config.ts`, `playwright.manager.config.ts`, host-stub stories, `src/storybook.css`, `src/storybook/catalog-layout.ts`, `scripts/ui-generator`, `scripts/storybook-process.mjs`, root `package.json` | `src/playwright/config.spec.ts`, Storybook process tests, `src/storybook/catalog-layout.spec.ts`, host path and static-freshness tests, middleware tests, interaction tests, package panel and manager browser tests on macOS and Linux | Partial: gap VD-GAP-002                 |
| `VD-GOV-001`, `VD-GOV-002`, `VD-GOV-003`, `VD-GOV-004`, `VD-GOV-005`, `VD-GOV-006`, `VD-GOV-007`, `VD-GOV-008`, `VD-GOV-009`, `VD-GOV-010`, `VD-GOV-011`, `VD-GOV-012`, `VD-GOV-013`, `VD-GOV-014`, `VD-GOV-015` | `spec/book.toml`, `AGENTS.md`, `package.json`, `docker/visual-delta-ci/Dockerfile`, `scripts/check-ci-image.mjs`, `scripts/check-npm-release.mjs`, `scripts/verify-npm-provenance.mjs`, `scripts/check-spec-structure.mjs`, `scripts/check-spec-first.mjs`, `.github/workflows/publish-visual-delta-ci.yml`, `.github/workflows/visual-delta-spec-first.yml`, `.github/workflows/visual-delta-ci.yml`, `.github/workflows/npm-publish.yml`, `.github/workflows/capture-canonical-panel-baselines.yml`, `.github/workflows/publish-storybook-pages.yml`, `README.md` | `scripts/check-ci-image.spec.mjs`, `scripts/check-npm-release.spec.mjs`, `scripts/verify-npm-provenance.spec.mjs`, `scripts/check-spec-structure.spec.mjs`, `scripts/check-spec-first.spec.mjs`, native x64 and ARM64 image smoke, published manifest inspection, package-tooling image-consumption inspection, Visual Delta pull-request and `master`-push trigger inspection, mdBook build, Markdown lint, workflow Node 24 action-runtime inspection, GitHub Pages workflow structure and static-build completeness checks, `pnpm audit`, release package dry-run, Sigstore verification, aggregate-check wiring, authorized canonical baseline-artifact capture, and package/panel/browser-matrix/manager CI | Partial only for the separately authorized canonical baseline capture; image publication, native smoke, and Pages workflow are verified |

## Current conformance gaps

These gaps came from the 2026-07-28 source audit. They remain open until implementation and evidence satisfy the linked requirements.

### VD-GAP-000: canonical baseline cutover

The package contracts, browser-only path resolver, staged capture runner,
migration inventory, ARM64 workflow lanes, and `0.063%` defaults are implemented.
Publication run
[`30713531516`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30713531516)
verified native AMD64 and ARM64 containers before emitting the reviewed lock:
multi-platform digest
`sha256:5ddf2fdea54c34ce52e6eae564512d417b024739ce47bc51d81216e10c27623a`,
ARM64 child digest
`sha256:71968d021eb75280f66dec675bc2b8b9e2224734cf58ca1ea0c06019969df705`,
Chromium `149.0.7827.0`, Firefox `151.0`, WebKit `26.5`, and font-manifest
digest
`sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3`.

Existing committed package and fixture PNGs remain platform-qualified and
direct story wiring is retained only until a separately authorized recapture
and migration. This keeps `VD-BASE-007` partial. No existing PNG may be renamed,
replaced, or deleted to close this gap without the separate baseline
authorization described by the delivery sequence.

### VD-GAP-001: portable interaction comparison

The normal portable `defineVisualSuite()` path enumerates primary and named-mode captures, but it does not enumerate wired `parameters.visualDelta.interactions`. The host’s custom suite discovers and compares on-disk interaction baselines.

This violates `VD-BASE-001` for portable consumers. The portable suite must load wired interaction definitions, replay each exact point, and classify each target without requiring update-mode environment state.

### VD-GAP-002: duplicate path and capture logic

Canonical baseline paths and capture behavior exist in the package and in `scripts/ui-generator`. Recent changes align several cases, but two implementations can still drift.

This leaves `VD-BASE-002` and `VD-HOST-006` partial. Host writers should consume package-owned identity and capture helpers, with host adapters limited to Svelte source changes and repository policy.

### VD-GAP-003: static geometry settlement

The manager-side HTML capture proves stable viewport and measured layout. Static Playwright waits for exact story completion, Storybook preparation state, fonts, and delay, but it does not explicitly prove stable body, root, and subject geometry across consecutive frames.

This leaves `VD-CAP-002` partial. The shared readiness helper should expose one geometry-settlement contract used by live Chromium and static Playwright.

### VD-GAP-005: delayed missing-baseline actions

Browser acceptance reaches the terminal missing-baseline state after a delayed `storyFinished`, but both expected create actions remain absent. The same action is available for an immediately missing PNG.

This violates `VD-UI-001`. Readiness reconciliation must derive missing-target actions after the completed render generation without requiring navigation or another refresh.

## Retired package-root documentation audit

The package-root documents below were audited before removal. Behavioral decisions were retained in stable requirements and normative prose; transient progress logs, obsolete gap claims, and duplicated implementation narration were intentionally not retained.

| Retired document                        | Canonical coverage                                                                                    | Disposition                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AFFECTED_VISUAL_TESTS_PLAN.md`         | `VD-RUN-004`, `VD-RUN-005`, `VD-HOST-005`, [Test runs and scopes](./test-runs-and-scopes.md)          | Graph, cache, full-fallback, dry-run, and full-suite safety contracts retained                    |
| `BASELINE_HISTORY_PLAN.md`              | `VD-VCS-001`, [Baseline history](./vcs-and-history.md#baseline-history)                               | Read-only Git/Jujutsu history, identifiers, working-copy safety, images, and source diff retained |
| `STORYBOOK_LAYOUT_ALIGNMENT_PLAN.md`    | `VD-CAP-002`, `VD-CAP-005`, `VD-UI-002`, `VD-UI-003`, `VD-UI-006`                                     | Settled measured geometry, reconstruction, placement, and teardown retained                       |
| `STORYBOOK_RELOAD_READINESS_PLAN.md`    | `VD-ARCH-003`, `VD-UI-001`, `VD-UI-006`, `VD-HOST-004`, `VD-RUN-004`, `VD-RUN-006`                    | Generation readiness, remount recovery, supervisor ownership, caching, and run recovery retained  |
| `TESTING_MODULE_SCOPE_PLAN.md`          | `VD-RUN-001` through `VD-RUN-006`, `VD-MUT-002` through `VD-MUT-006`, `VD-HOST-007`                   | Frozen scopes, action ordering, progress, exact mutations, and host capture layout retained       |
| `VISUAL_DELTA_CONSISTENCY_PLAN.md`      | `VD-ARCH-002`, `VD-ARCH-005`, `VD-BASE-005`, `VD-CAP-006`, `VD-MUT-003`, `VD-MUT-005`                 | Result authority, sidecar freshness, failure isolation, and state independence retained           |
| `VISUAL_DELTA_WORKFLOW_VCS_PLAN.md`     | `VD-VCS-002` through `VD-VCS-006`, `VD-MUT-005`, `VD-MUT-006`, `VD-CONF-003`, `VD-CONF-005`           | Change sets, local commit gates, auto-accept separation, and safety prohibitions retained         |
| `PARITY.md`                             | [Scope and non-goals](./index.md#scope-and-non-goals), `VD-CONF-*`, `VD-CAP-*`, `VD-UI-*`, `VD-RUN-*` | Stale third-party gap matrix retired; local behavior and explicit cloud non-goals retained        |
| `VENDOR.md`                             | All component specifications; package provenance in `README.md`, `package.json`, and `LICENSE`        | Duplicated behavior notes retired; user-facing integration and provenance retained                |
| Legacy `specs/*.md` compatibility files | `VD-GOV-001`, `VD-GOV-007`, canonical chapters under `spec/src/`                                      | Pointer-only tree removed; it contained no independent requirements                               |

The project built-in changed-pixel allowance is `0.063%`; explicit story, project,
environment, and legacy values retain precedence under `VD-CONF-001`. The
independent per-pixel `diffThreshold` defaults to `0.063`. Package-generated
story wiring does not inject a stricter threshold. Package panel screenshot
acceptance consumes the same resolved allowance, converting the percentage to
Playwright's ratio (`0.00063` for the built-in default), and the shared config
unit test guards that conversion.

## Audit evidence

The 2026-07-28 audit began from the current package source and excluded unrelated working-copy story, host-policy, and baseline changes.

| Check                                                    | Result                               | Scope                                                                           |
| -------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm --filter @lapismd/storybook-addon-visual-delta typecheck` | Passed                        | Package TypeScript                                                              |
| `pnpm exec vitest run --project visual-delta`            | Passed: 85 files, 341 tests          | Package unit and component behavior                                             |
| Focused host baseline, middleware, and interaction tests | Passed: 3 files, 59 tests            | Catalog adapters and exact mutation behavior                                    |
| Same-story preview readiness browser regression          | Passed                               | Exact marker, manager readiness, and stopped progress after a controls rerender |
| Specification link and requirement validation            | Passed: 13 pages, 68 requirements    | Markdown links, index coverage, IDs, traceability, and package-root policy      |
| Specification structure and spec-first checker tests     | Passed: 19 tests                     | Governance classifier and structural failure modes                              |
| Canonical Markdown lint and mdBook build                 | Passed                               | Source formatting and generated-book integrity                                  |
| `pnpm visual-delta test --affected --dry-run --explain`  | Passed: conservative 358-story scope | Read-only full-suite fallback after configuration change                        |
| `pnpm test:panel` (sibling package)                      | Passed after gated panel baseline refresh | Panel shell screenshots refreshed for baseline-row action chrome after sibling extract |

Panel shell screenshot mismatches from the prior monorepo audit (baseline-row action icons) were refreshed with an explicit gated Playwright update after sibling extract. Compare-only `pnpm test:panel` is the ongoing gate.

This table records one audit, not a permanent guarantee. Update it when a specification change adds evidence or changes a conformance state.

## Required validation

Use the smallest tier that covers the changed boundary, then add broader checks for cross-boundary changes.

### Documentation-only contract changes

Run:

```bash
pnpm spec:check
```

The command validates:

- The mdBook builds from canonical source without committing generated output
- Canonical Markdown passes the configured lint policy
- Every relative Markdown link resolves
- Every requirement ID is unique at its definition
- Every requirement ID appears in this traceability file
- Every canonical page appears exactly once in `SUMMARY.md`
- The obsolete `specs/` tree is absent
- Package-root Markdown consists exactly of `AGENTS.md`, `DEVELOPMENT.md`, and `README.md`
- Protected implementation changes include a canonical specification update

### Package behavior changes

Run:

```bash
pnpm --filter @lapismd/storybook-addon-visual-delta typecheck
pnpm exec vitest run --project visual-delta
```

Add focused host tests when paths, source patches, middleware, interactions, or review tags change.

### Installation doctor or cache-layout changes

Run:

```bash
pnpm exec vitest run src/node/doctor.spec.ts src/node/change-set-store.spec.ts
pnpm build:node
node dist/node/cli.js doctor --json
```

The CLI smoke MUST use the current host configuration without `--fix`, report
the resolved snapshot directory, and leave baselines, source, configuration,
and external snapshot repositories unchanged. A release-facing change MUST
also run the same read-only command from a freshly packed tarball.

### Affected planning changes

Run:

```bash
pnpm visual-delta test --affected --dry-run --explain
```

The explanation must show selected stories, changed inputs, and any conservative fallback. This command must not build, capture, or update snapshots.

### Manager, panel, or preview changes

Run panel browser acceptance on an unused checkout-local lane:

```bash
STORYBOOK_PORT=your_unused_base_port pnpm test:visual-delta-panel
```

Do not stop another checkout’s listener. Browser acceptance remains compare-only.

### Browser-matrix or failure-policy changes

Run:

```bash
pnpm test:browsers
```

This creates an ignored temporary Storybook fixture, runs Chromium, Firefox,
and WebKit against exact per-browser baselines, and verifies pass, missing,
mismatch, warn, strict, selected-project, and full-matrix behavior. It never
creates or updates a committed baseline.

### Capture or baseline behavior changes

Run focused package and host tests, panel browser acceptance, then the complete compare suite:

```bash
pnpm test:visual
```

Never pass `--update-snapshots` during verification. Baseline changes require the explicit mutation workflow from [Mutations and review](./mutations-and-review.md).

### Pull request and master-push CI

Standalone package workflow `.github/workflows/visual-delta-ci.yml` runs on pull requests and pushes to `master`. Both triggers run the same jobs (compare-only; no snapshot updates):

| Job | Command surface |
| --- | --- |
| Package typecheck and unit tests | `pnpm typecheck`, `pnpm test` |
| Browser-matrix acceptance | `pnpm test:browsers` |
| Panel browser acceptance | `pnpm test:panel` |
| Manager browser acceptance | `pnpm test:manager` (live Storybook + host stubs; packaged fixture baselines under `tests/fixtures/visual-baselines`) |

Specification-first enforcement remains a separate required workflow (see [Specification governance](./spec-governance.md)). Host catalog `pnpm test:visual` stays in the UI repository.

### GitHub Pages Storybook deployment

`.github/workflows/publish-storybook-pages.yml` builds the package Storybook
after pushes to `main` and on manual dispatch. Its x64 build job uses the
repository CI image, installs the frozen dependency graph, runs
`pnpm build-storybook` with `VISUAL_DELTA_PACKAGE_BASELINES=1`, verifies
`index.html`, `iframe.html`, and `index.json`, and uploads only
`storybook-static`. The explicit baseline-fixture selection prevents an
optional sibling host checkout from entering the public artifact. The build
job can read Pages metadata but cannot write Pages or request an OIDC token. A
separate `github-pages` job deploys that artifact with `pages: write` and
`id-token: write`; it performs no package or visual-test work.

Before relying on the first deployment, run:

```bash
VISUAL_DELTA_PACKAGE_BASELINES=1 pnpm build-storybook
test -f storybook-static/index.html
test -f storybook-static/iframe.html
test -f storybook-static/index.json
pnpm spec:check
```

These commands are read-only with respect to committed baselines. The workflow
checker verifies the trigger, job boundary, permissions, CI image, frozen
install, complete static artifact, Node 24 action allowlist, and stable README
link. Repository Pages settings MUST select GitHub Actions as the publishing
source before the first deployment.

`src/shared/preview-layout.spec.ts` MUST prove that CSSOM border widths for
non-painted `none` and `hidden` sides do not alter reconstructed geometry under
the supported DOM test runtime. `scripts/check-ci-image.spec.mjs` MUST prove
that each `pnpm test:browsers` run step restores `HOME=/root` inside its job
container, without introducing workflow- or job-scoped root HOME.

### Manual CI-image publication

`.github/workflows/publish-visual-delta-ci.yml` runs only through manual
dispatch from the default branch. It rejects `latest`, malformed audit tags,
and an audit tag already present in GHCR before building. A successful run
publishes one Linux AMD64/ARM64 manifest as both the requested audit tag and
`latest`, then compares their raw manifests and verifies both architectures.
Architecture verification parses the manifest JSON and requires exactly one
Linux AMD64 and one Linux ARM64 child; JSON whitespace or key formatting cannot
change that outcome.
The Dockerfile warms the pnpm store without running project lifecycle scripts
and installs the exact Node.js, npm, pnpm, mdBook, and Playwright Chromium,
Firefox, and WebKit versions required by repository workflows.
The native smoke runs with container-scoped `HOME=/root` and still
requires pnpm `10.32.1` from the fixed image-owned Corepack cache. Every
publication command uses Bash, matching the workflow syntax being checked. The
native smoke jobs and every repository run step that launches Firefox
explicitly restore `HOME=/root` inside its container; Firefox MUST launch rather
than inherit GitHub's uid-1001-owned `/github/home` mount while the container
process runs as root. Checker coverage also rejects workflow- or job-scoped root
HOME values so host Docker setup retains its accessible runner-owned
configuration directory.
The ARM64 smoke records the actual tool and browser versions plus a sorted,
content-derived font-manifest hash. A final profile job depends on both native
smokes, combines that ARM64 evidence with the published multi-platform and ARM64
child digests and canonical rendering context, and retains the complete profile
JSON and native ARM64 evidence for review. A profile artifact produced before a
native smoke, or populated only from declared package versions, is invalid.
The native evidence upload uses one staged evidence directory and MUST contain
the browser-version JSON, content-addressed font manifest, and native summary;
an artifact containing only one of those files is incomplete.

Publication run
[`30713531516`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30713531516)
is the reviewed profile evidence. Both native smoke jobs passed, the profile's
browser inventory matched the ARM64 inventory, and hashing the retained
55-entry font manifest reproduced the recorded font-manifest digest. Canonical
visual jobs therefore lock the ARM64 child digest from that run; general x64
tooling jobs continue to consume the mutable `latest` alias.

After the linked GHCR package was made public, a fresh Docker configuration
without credentials pulled the locked ARM64 digest, and
`visual-delta harness doctor` completed the Linux/ARM64 container probe with no
diagnostics. The publication workflow repeats an anonymous audit-tag inspection
so later package-visibility regressions fail before a new profile is reviewed.

Pull-request canary run
[`30713852205`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30713852205)
confirmed that checkout's temporary HOME does not retain its safe-directory
entry once the root-owned container HOME is restored. The spec-first workflow
therefore fetches complete history and explicitly registers
`$GITHUB_WORKSPACE` under `/root` before its exact base-to-head diff; the CI
image checker rejects removal of either prerequisite.

Release run
[`30716393339`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30716393339)
confirmed that the same boundary applies to the x64 npm package gate. Its
lint, structure, build, checker tests, and CI-image validation passed, but
`spec:first` failed closed when Git could not inspect the checkout after
Actions restored `HOME=/root`. The release package gate therefore registers
`$GITHUB_WORKSPACE` after checkout, and CI-image checker coverage requires both
release gates that read VCS history to retain that step.

ARM64 canary run
[`30714115219`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30714115219)
then exposed checkout-history access under the same root HOME in manager
acceptance and a Linux-only race that discarded shared horizontal scroll when
split chrome was rebuilt after a zoom transition. Manager and release visual
jobs therefore register the safe checkout explicitly, while focused and full
Linux manager acceptance must prove that active shared scroll survives chrome
rebuilds before the ARM lane is accepted.

Release run
[`30718693799`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30718693799)
verified the x64 checkout-trust correction, package gate, and panel acceptance,
then exposed five manager mutation regressions. The teaching-fixture guard had
treated retained platform-qualified host acceptance PNGs as unqualified demo
assets and removed their Create, Update, and Delete controls. Focused local
manager acceptance reproduced the missing action. Environment-selection unit
coverage and the five affected manager scenarios therefore distinguish the
temporary legacy host fixtures from compare-only teaching assets.

Release run
[`30738781004`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30738781004)
passed the x64 release and package gate, then failed compare-only ARM64 panel
acceptance for exactly the `narrow-right` passed, mixed-mode-failure, and
capture-error references. The 400 CSS pixel expanded-body minimum and `50cqh`
scroll runway required by `VD-UI-012` intentionally changed those three layouts;
all wide references and the other narrow states passed. The approved repair is
limited to replacing those three platform-qualified Linux/ARM64 references and
their three macOS counterparts, followed by focused and full compare-only
acceptance. It does not authorize the browser-only baseline cutover, a threshold
change, or any other baseline mutation.

Visual review of the six refreshed references confirmed only the specified
accordion body and scroll-runway geometry; typography, colors, controls, and
states remained unchanged. With `PLAYWRIGHT_UPDATE_SNAPSHOTS=0`, the focused
three-test and full thirteen-test panel suites passed compare-only on macOS and
in the immutable ARM64 image. ARM64 manager acceptance passed 48 tests with
only the documented VCS-history skip. The specification gate, build, typecheck,
426 unit tests, dependency audit, exact `v0.0.2` metadata check, and npm package
dry-run also passed without producing any additional baseline change.

The combined primary, mode, and interaction VCS-history manager test remains
temporarily skipped because its mode-popover sequence is unstable only within
the full ARM64 manager suite. Focused execution against the immutable ARM64
image passed repeatedly, but the skipped test is not verification evidence and
must be re-enabled before VCS-history UI coverage can be considered complete.

### Manual canonical panel-baseline capture

`.github/workflows/capture-canonical-panel-baselines.yml` runs only when manually
dispatched from the default branch. It uses the immutable Linux/ARM64 profile and
`--update-snapshots=missing` to create Linux references without replacing an
existing one. Playwright reports a non-zero result for those newly written
references, so the workflow continues only to its exact-set assertion and
compare-only `pnpm test:panel` gate; both must pass before it records a checksum
manifest or uploads only browser-qualified panel references plus that
manifest. Its capture job has only `contents: write` and
`pull-requests: write`: it commits only the exact verified PNG paths to a new
automation branch and opens a review pull request, never writing to the
selected revision. A reviewer must inspect and merge that pull request.

### npm release CI

`.github/workflows/npm-publish.yml` runs only on `v*` tag pushes. It validates
the exact stable version and public manifest, runs all release gates, publishes
through the approved bootstrap or trusted-publisher Environment, then verifies
the installed npm artifact's Sigstore provenance on a clean runner. The
bootstrap path is restricted to `v0.0.1`; subsequent releases cannot access an
npm token. The bootstrap publish command uses an ephemeral npm user config with
an environment-variable token reference, and the package gate verifies the
packed CLI mapping and executable mode before either publication path runs. The
workflow retains `npm-signatures.json` for successful or failed
verification; a successful release confirms the package, tag, repository,
workflow, and Sigstore bundle.

Release run
[`30745135562`](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/30745135562)
passed its x64 package gate, ARM64 visual gate, and trusted npm publication for
`0.0.2`. Its final parser rejected the otherwise verified provenance because
npm encoded the scoped-package PURL as
`pkg:npm/%40lapismd/storybook-addon-visual-delta@0.0.2`, while the parser
expected an unescaped `@`. The retained clean-runner `npm audit signatures`
evidence contains the tarball SHA-512 and exact release tag, repository, and
workflow. Focused verification now derives npm's canonical PURL, accepts that
release evidence, and rejects the former non-canonical subject fixture.

Also fix EditRemoveAndClear to use its own baseline path for primary image (optional consistency).

Kill any leftover storybook on panel ports, then run focused failing tests first.

## Review checklist

Before declaring conformance:

- The changed behavior has a stable requirement ID
- The requirement has focused automated evidence or a declared gap
- Compare-only commands wrote no baseline
- Exact scope stayed frozen, including empty scope
- Review state, result state, coverage, and eligibility stayed independent
- Error and cancellation paths preserved trustworthy prior state
- Host adapters did not redefine portable package behavior
- Existing unrelated working-copy changes remain untouched

Related contracts: [System specification](./index.md), [Specification governance](./spec-governance.md), [Test runs and scopes](./test-runs-and-scopes.md), and [UI catalog host profile](./host-profile.md).
