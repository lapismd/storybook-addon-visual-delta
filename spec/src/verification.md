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
| `VD-ARCH-001`, `VD-ARCH-002`, `VD-ARCH-003`, `VD-ARCH-004`, `VD-ARCH-005`                               | `src/manager.tsx`, `src/preview.ts`, `src/node/middleware.ts`, `src/playwright/suite.ts`, `src/node/run-hub.ts`                                                                                                                                                                | `src/node/portable-host.spec.ts`, `src/node/runtime-instance.spec.ts`, `src/manager/reload-on-restart.spec.ts`, panel browser tests                                                                                                                                                 | Conforming                              |
| `VD-CONF-001`, `VD-CONF-002`, `VD-CONF-003`, `VD-CONF-004`, `VD-CONF-005`, `VD-CONF-006`, `VD-CONF-007` | `src/node/project-config.ts`, `src/node/options.ts`, `src/preview/init.ts`, `src/shared/story-config.ts`, `src/shared/capabilities.ts`, `src/shared/manager-options.ts`, `src/panel/settings.ts`, `src/playwright/config.ts`                                                                                                                  | `src/node/project-config.spec.ts`, `src/node/options.spec.ts`, `src/shared/capabilities.spec.ts`, `src/panel/settings.spec.ts`, `src/playwright/config.spec.ts`, `src/node/story-source.spec.ts`                                                                                                                       | Conforming                              |
| `VD-API-001`, `VD-API-002`, `VD-API-003`, `VD-API-004`, `VD-API-005`, `VD-API-006`, `VD-API-007`         | `package.json`, `scripts/check-npm-release.mjs`, `src/node/cli.ts`, `src/node/init-scaffold.ts`, `src/constants.ts`, `src/node/middleware.ts`, `src/preview/capture-params.ts`, `src/node/run-hub.ts`                                                                          | `scripts/check-npm-release.spec.mjs`, `src/node/init-scaffold.spec.ts`, `src/constants.spec.ts`, `src/node/run-hub.spec.ts`, `src/preview/render-lifecycle.spec.ts`, package dry-run, and host middleware tests                                                                    | Conforming                              |
| `VD-BASE-001`, `VD-BASE-002`, `VD-BASE-003`, `VD-BASE-004`, `VD-BASE-005`, `VD-BASE-006`                | `src/node/snapshot-paths.ts`, `src/shared/baseline-url.ts`, `src/node/baseline-vite-plugin.ts`, `src/node/visual-sidecars.ts`, `src/manager/run-visual.ts`, `src/playwright/suite.ts`                                                                                          | `src/node/snapshot-paths.spec.ts`, `src/shared/baseline-url.spec.ts`, `src/node/visual-sidecars.spec.ts`, manager story-switch, host baseline, and interaction tests                                                                                                                | Partial: gaps VD-GAP-001 and VD-GAP-002 |
| `VD-CAP-001`, `VD-CAP-002`, `VD-CAP-003`, `VD-CAP-004`, `VD-CAP-005`, `VD-CAP-006`                      | `src/playwright/config.ts`, `src/playwright/readiness.ts`, `src/playwright/suite.ts`, `src/node/capture-subject.ts`, `src/panel/capture.ts`, `src/preview/capture-ready.ts`, `src/preview/render-lifecycle.ts`, `src/shared/capture-target.ts`, `src/shared/preview-layout.ts` | `src/playwright/config.spec.ts`, `src/shared/baseline-readiness.spec.ts`, `src/shared/capture-target.spec.ts`, `src/shared/preview-layout.spec.ts`, `src/preview/capture-ready.spec.ts`, `src/preview/render-lifecycle.spec.ts`, `src/panel/capture.spec.ts`, overlay browser tests | Partial: gaps VD-GAP-003 and VD-GAP-004 |
| `VD-UI-001`, `VD-UI-002`, `VD-UI-003`, `VD-UI-004`, `VD-UI-005`, `VD-UI-006`, `VD-UI-007`, `VD-UI-008` | `src/panel/Panel.tsx`, `src/panel/PanelView.tsx`, `src/panel/VisualDeltaHeader.tsx`, `src/panel/BaselineAccordion.tsx`, `src/panel/hooks.ts`, `src/panel/capture.ts` (`measureSettledOverlayLayout`), `src/preview/overlay.ts`, `src/preview/capture-ready.ts`, `src/panel/usePlaySteps.ts`, `src/manager/run-visual.ts`, `src/manager.tsx`, `src/shared/overlay-session.ts`, `src/shared/compare-zoom.ts`, `src/shared/capabilities.ts`                 | Panel component tests, `src/shared/capabilities.spec.ts`, `src/shared/compare-zoom.spec.ts`, compare-view keyboard tests, `src/preview/capture-ready.spec.ts`, `src/preview/render-lifecycle.spec.ts`, `src/preview/overlay-image-error.spec.ts`, `src/shared/overlay-session.spec.ts`, `src/panel/capture.spec.ts` (overlay layout settlement), `src/manager/run-visual-reconnect.spec.ts`, interaction-list scroll, manager story-switch, and `tests/overlay-placement.spec.ts` full-viewport shared-scroll browser coverage | Partial: gap VD-GAP-005                 |
| `VD-RUN-001`, `VD-RUN-002`, `VD-RUN-003`, `VD-RUN-004`, `VD-RUN-005`, `VD-RUN-006`                      | `src/shared/action-scope.ts`, `src/node/static-build.ts`, `src/node/affected-visual-tests.ts`, `src/node/run-hub.ts`, `src/manager/run-visual.ts`, `src/manager/VisualTestProvider.tsx`, `src/manager/visual-test-module-prefs.ts`, `src/manager/VisualTestModuleUI.tsx`, `src/panel/Panel.tsx`, `scripts/ui-generator/pipeline/visual-interaction-update.ts`                           | `src/shared/action-scope.spec.ts`, `src/node/static-build.spec.ts`, `src/node/affected-visual-tests.spec.ts`, `src/node/affected-plan-cache.spec.ts`, `src/node/run-hub.spec.ts`, `src/manager/abort-visual-work.spec.ts`, `src/manager/run-visual-reconnect.spec.ts`, `tests/manager-sidebar.spec.ts`, host interaction static-freshness, create-progress scope, and manager run tests | Conforming                              |
| `VD-MUT-001`, `VD-MUT-002`, `VD-MUT-003`, `VD-MUT-004`, `VD-MUT-005`, `VD-MUT-006`                      | `src/shared/interaction-capture.ts`, `src/node/baseline-cli.ts`, `src/node/middleware.ts`, `src/node/delete-baseline.ts`, `src/node/story-source.ts`, `src/manager/run-visual.ts`, `src/panel/Panel.tsx`, `src/manager/AcceptSplitButton.tsx`, `scripts/ui-generator/pipeline/visual-interaction-update.ts` | `src/shared/interaction-capture.spec.ts`, `src/node/delete-baseline.spec.ts`, `src/node/story-source.spec.ts`, `src/node/init-scaffold.spec.ts`, `src/manager/review-updates-from-results.spec.ts`, host middleware and writer tests                                              | Conforming                              |
| `VD-VCS-001`, `VD-VCS-002`, `VD-VCS-003`, `VD-VCS-004`, `VD-VCS-005`, `VD-VCS-006`                      | `src/node/baseline-history-vcs.ts`, `src/node/change-set-store.ts`, `src/node/change-set-vcs.ts`, `src/shared/workflow-config.ts`                                                                                                                                              | `src/node/baseline-history-vcs.spec.ts`, `src/node/change-set-store.spec.ts`, and `src/node/change-set-vcs.spec.ts`; real Jujutsu fixtures are skipped only when `jj` is unavailable, while mock-based adapter coverage always runs | Conforming                              |
| `VD-HOST-001`, `VD-HOST-002`, `VD-HOST-003`, `VD-HOST-004`, `VD-HOST-005`, `VD-HOST-006`, `VD-HOST-007`, `VD-HOST-008`, `VD-HOST-009` | UI `.storybook/main.ts` + `visual-delta-preset.ts`, package `.storybook/main.ts` self-test catalog (sibling / packaged fixture mounts), `playwright.panel.config.ts`, `playwright.manager.config.ts`, host-stub stories, `src/storybook.css`, `src/storybook/catalog-layout.ts`, `scripts/ui-generator`, `scripts/storybook-process.mjs`, root `package.json` | `src/playwright/config.spec.ts`, Storybook process tests, `src/storybook/catalog-layout.spec.ts`, host path and static-freshness tests, middleware tests, interaction tests, package panel and manager browser tests on macOS and Linux | Partial: gap VD-GAP-002                 |
| `VD-GOV-001`, `VD-GOV-002`, `VD-GOV-003`, `VD-GOV-004`, `VD-GOV-005`, `VD-GOV-006`, `VD-GOV-007`, `VD-GOV-008`, `VD-GOV-009`, `VD-GOV-010`, `VD-GOV-011` | `spec/book.toml`, `AGENTS.md`, `package.json`, `scripts/check-npm-release.mjs`, `scripts/verify-npm-provenance.mjs`, `scripts/check-spec-structure.mjs`, `scripts/check-spec-first.mjs`, `.github/workflows/visual-delta-spec-first.yml`, `.github/workflows/visual-delta-ci.yml`, `.github/workflows/npm-publish.yml`, `.github/workflows/capture-linux-panel-baselines.yml` | `scripts/check-npm-release.spec.mjs`, `scripts/verify-npm-provenance.spec.mjs`, `scripts/check-spec-structure.spec.mjs`, `scripts/check-spec-first.spec.mjs`, mdBook build, Markdown lint, workflow Node 24 configuration/action-runtime inspection, `pnpm audit`, release package dry-run, Sigstore verification, aggregate-check wiring, manual Linux baseline-artifact capture, and path-filtered package/panel/host visual CI | Conforming |

## Current conformance gaps

These gaps came from the 2026-07-28 source audit. They remain open until implementation and evidence satisfy the linked requirements.

### VD-GAP-001: portable interaction comparison

The normal portable `defineVisualSuite()` path enumerates primary and named-mode captures, but it does not enumerate wired `parameters.visualDelta.interactions`. The host’s custom suite discovers and compares on-disk interaction baselines.

This violates `VD-BASE-001` for portable consumers. The portable suite must load wired interaction definitions, replay each exact point, and classify each target without requiring update-mode environment state.

### VD-GAP-002: duplicate path and capture logic

Canonical baseline paths and capture behavior exist in the package and in `scripts/ui-generator`. Recent changes align several cases, but two implementations can still drift.

This leaves `VD-BASE-002` and `VD-HOST-006` partial. Host writers should consume package-owned identity and capture helpers, with host adapters limited to Svelte source changes and repository policy.

### VD-GAP-003: static geometry settlement

The manager-side HTML capture proves stable viewport and measured layout. Static Playwright waits for exact story completion, Storybook preparation state, fonts, and delay, but it does not explicitly prove stable body, root, and subject geometry across consecutive frames.

This leaves `VD-CAP-002` partial. The shared readiness helper should expose one geometry-settlement contract used by live Chromium and static Playwright.

### VD-GAP-004: live Chromium browser context

The portable Playwright configuration sets locale, time zone, light color scheme, and reduced motion. The middleware-owned live Chromium page currently sets viewport and device scale factor but does not set the rest of that context.

This leaves `VD-CAP-001` partial for Diff Chromium. The shared browser-context contract should configure both authoritative capture paths and have focused evidence for every deterministic setting.

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

The injected catalog threshold of `0.1%` and the project built-in of `1%` are resolved by `VD-CONF-001` and [Configuration](./configuration.md). Documentation drift does not lower a normative requirement.

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

### Capture or baseline behavior changes

Run focused package and host tests, panel browser acceptance, then the complete compare suite:

```bash
pnpm test:visual
```

Never pass `--update-snapshots` during verification. Baseline changes require the explicit mutation workflow from [Mutations and review](./mutations-and-review.md).

### Pull request CI

Standalone package workflow `.github/workflows/visual-delta-ci.yml` runs on pull requests. Jobs (compare-only; no snapshot updates):

| Job | Command surface |
| --- | --- |
| Package typecheck and unit tests | `pnpm typecheck`, `pnpm test` |
| Panel browser acceptance | `pnpm test:panel` |
| Manager browser acceptance | `pnpm test:manager` (live Storybook + host stubs; packaged fixture baselines under `tests/fixtures/visual-baselines`) |

Specification-first enforcement remains a separate required workflow (see [Specification governance](./spec-governance.md)). Host catalog `pnpm test:visual` stays in the UI repository.

### Manual Linux panel-baseline capture

`.github/workflows/capture-linux-panel-baselines.yml` runs only when manually
dispatched from the default branch. It uses Ubuntu Chromium and
`--update-snapshots=missing` to create Linux references without replacing an
existing one. Playwright reports a non-zero result for those newly written
references, so the workflow continues only to its exact-set assertion and
compare-only `pnpm test:panel` gate; both must pass before it records a checksum
manifest or uploads only `*-chromium-linux.png` panel references plus that
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
npm token. The workflow retains `npm-signatures.json` for successful or failed
verification; a successful release confirms the package, tag, repository,
workflow, and Sigstore bundle.

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
