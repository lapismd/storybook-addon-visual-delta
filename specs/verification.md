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

| Requirements                                                                              | Primary implementation evidence                                                                                                                                             | Primary automated evidence                                                                                                                                         | Audit state                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `VD-ARCH-001`, `VD-ARCH-002`, `VD-ARCH-003`, `VD-ARCH-004`, `VD-ARCH-005`                 | `src/manager.tsx`, `src/preview.ts`, `src/node/middleware.ts`, `src/playwright/suite.ts`, `src/node/run-hub.ts`                                                             | `src/node/portable-host.spec.ts`, `src/node/runtime-instance.spec.ts`, `src/manager/reload-on-restart.spec.ts`, panel browser tests                                | Conforming                              |
| `VD-CONF-001`, `VD-CONF-002`, `VD-CONF-003`, `VD-CONF-004`, `VD-CONF-005`, `VD-CONF-006`  | `src/node/project-config.ts`, `src/node/options.ts`, `src/preview/init.ts`, `src/shared/story-config.ts`, `src/panel/settings.ts`, `src/playwright/config.ts`               | `src/node/project-config.spec.ts`, `src/node/options.spec.ts`, `src/panel/settings.spec.ts`, `src/playwright/config.spec.ts`, `src/node/story-source.spec.ts`      | Conforming                              |
| `VD-API-001`, `VD-API-002`, `VD-API-003`, `VD-API-004`, `VD-API-005`, `VD-API-006`        | `package.json`, `src/node/cli.ts`, `src/constants.ts`, `src/node/middleware.ts`, `src/preview/capture-params.ts`, `src/node/run-hub.ts`                                     | `src/constants.spec.ts`, `src/node/run-hub.spec.ts`, `src/preview/render-lifecycle.spec.ts`, host middleware tests                                                 | Conforming                              |
| `VD-BASE-001`, `VD-BASE-002`, `VD-BASE-003`, `VD-BASE-004`, `VD-BASE-005`, `VD-BASE-006`  | `src/node/snapshot-paths.ts`, `src/shared/baseline-url.ts`, `src/node/baseline-vite-plugin.ts`, `src/node/visual-sidecars.ts`, `src/playwright/suite.ts`                    | `src/node/snapshot-paths.spec.ts`, `src/shared/baseline-url.spec.ts`, `src/node/visual-sidecars.spec.ts`, host baseline and interaction tests                      | Partial: gaps VD-GAP-001 and VD-GAP-002 |
| `VD-CAP-001`, `VD-CAP-002`, `VD-CAP-003`, `VD-CAP-004`, `VD-CAP-005`, `VD-CAP-006`        | `src/playwright/config.ts`, `src/playwright/readiness.ts`, `src/playwright/suite.ts`, `src/node/capture-subject.ts`, `src/panel/capture.ts`, `src/shared/preview-layout.ts` | `src/playwright/config.spec.ts`, `src/shared/baseline-readiness.spec.ts`, `src/shared/preview-layout.spec.ts`, `src/panel/capture.spec.ts`, overlay browser tests  | Partial: gaps VD-GAP-003 and VD-GAP-004 |
| `VD-UI-001`, `VD-UI-002`, `VD-UI-003`, `VD-UI-004`, `VD-UI-005`, `VD-UI-006`, `VD-UI-007` | `src/panel/Panel.tsx`, `src/panel/PanelView.tsx`, `src/preview/overlay.ts`, `src/panel/usePlaySteps.ts`, `src/manager/run-visual.ts`                                        | Panel component tests, `src/preview/render-lifecycle.spec.ts`, `src/manager/run-visual-reconnect.spec.ts`, panel browser tests                                     | Partial: gaps VD-GAP-005 and VD-GAP-006 |
| `VD-RUN-001`, `VD-RUN-002`, `VD-RUN-003`, `VD-RUN-004`, `VD-RUN-005`, `VD-RUN-006`        | `src/shared/action-scope.ts`, `src/node/static-build.ts`, `src/node/affected-visual-tests.ts`, `src/node/run-hub.ts`, `src/manager/run-visual.ts`                           | `src/shared/action-scope.spec.ts`, `src/node/affected-visual-tests.spec.ts`, `src/node/affected-plan-cache.spec.ts`, `src/node/run-hub.spec.ts`, manager run tests | Conforming                              |
| `VD-MUT-001`, `VD-MUT-002`, `VD-MUT-003`, `VD-MUT-004`, `VD-MUT-005`, `VD-MUT-006`        | `src/node/baseline-cli.ts`, `src/node/middleware.ts`, `src/node/delete-baseline.ts`, `src/node/story-source.ts`, `src/node/project-config.ts`                               | `src/node/delete-baseline.spec.ts`, `src/node/story-source.spec.ts`, `src/node/init-scaffold.spec.ts`, host middleware and writer tests                            | Partial: gap VD-GAP-006                 |
| `VD-VCS-001`, `VD-VCS-002`, `VD-VCS-003`, `VD-VCS-004`, `VD-VCS-005`, `VD-VCS-006`        | `src/node/baseline-history-vcs.ts`, `src/node/change-set-store.ts`, `src/node/change-set-vcs.ts`, `src/shared/workflow-config.ts`                                           | Baseline history, change-set store, and change-set VCS specifications                                                                                              | Conforming                              |
| `VD-HOST-001`, `VD-HOST-002`, `VD-HOST-003`, `VD-HOST-004`, `VD-HOST-005`, `VD-HOST-006`  | `.storybook/main.ts`, `.storybook/visual-delta-preset.ts`, `scripts/ui-generator`, `scripts/storybook-process.mjs`, root `package.json`                                     | Storybook process tests, host path tests, middleware tests, interaction tests, panel browser tests                                                                 | Partial: gap VD-GAP-002                 |

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

### VD-GAP-006: exact interaction creation

Browser acceptance can discover and select an unwired `findByTestId("panel-shell")` interaction, but its exact create-baseline menu action never appears and the request is not sent.

This violates `VD-UI-004` and leaves `VD-MUT-001` partial. The selected discovery must remain addressable after the manager switches back to Visual Delta, and creation must freeze that interaction’s ID, label, and capture call.

## Documentation drift found by the audit

These files are non-normative, but their current text can mislead implementers:

- `PARITY.md` says affected or TurboSnap-style execution is missing, although affected planning and execution now exist
- The package `README.md` middleware route table omits configuration, history, change-set, story-facts, threshold, initialization, and runtime routes
- The package `README.md` uses `stepId` in an interaction entry example, while the public and runtime shape is `{ id, label, src }`
- Historical plans mix completed decisions with future-tense language and should not be read as current authority
- The injected catalog threshold of `0.1%` and the project built-in of `1%` lacked an explicit precedence statement; `VD-CONF-001` and [Configuration](./configuration.md) now resolve it

Documentation drift does not lower a normative requirement. Explanatory files should link back to this specification and update when their examples conflict.

## Audit evidence

The 2026-07-28 audit began from the current package source and excluded unrelated working-copy story, host-policy, and baseline changes.

| Check                                                    | Result                               | Scope                                                      |
| -------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `pnpm --filter storybook-addon-visual-delta typecheck`   | Passed                               | Package TypeScript                                         |
| `pnpm exec vitest run --project visual-delta`            | Passed: 84 files, 334 tests          | Package unit and component behavior                        |
| Focused host baseline, middleware, and interaction tests | Passed: 3 files, 59 tests            | Catalog adapters and exact mutation behavior               |
| Specification link and requirement validation            | Passed: 12 pages, 60 requirements    | Markdown links, index coverage, IDs, and traceability      |
| `pnpm visual-delta test --affected --dry-run --explain`  | Passed: conservative 358-story scope | Read-only full-suite fallback after configuration change   |
| `pnpm test:visual-delta-panel` on an isolated lane       | Failed: 41 passed, 10 failed         | Two behavioral gaps and eight existing snapshot mismatches |

The panel run used the isolated `12009` lane and left no listener running. The eight screenshot mismatches affect four states in both wide-bottom and narrow-right layouts. Visual inspection localizes the drift to baseline-row action icons; the run did not update any snapshot.

This table records one audit, not a permanent guarantee. Update it when a specification change adds evidence or changes a conformance state.

## Required validation

Use the smallest tier that covers the changed boundary, then add broader checks for cross-boundary changes.

### Documentation-only contract changes

Run:

```bash
pnpm exec prettier --check packages/storybook-addon-visual-delta/specs packages/storybook-addon-visual-delta/README.md packages/storybook-addon-visual-delta/VENDOR.md packages/storybook-addon-visual-delta/PARITY.md
```

Also validate:

- Every relative Markdown link resolves
- Every requirement ID is unique at its definition
- Every requirement ID appears in this traceability file
- Every page is linked from `index.md`

### Package behavior changes

Run:

```bash
pnpm --filter storybook-addon-visual-delta typecheck
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

Related contracts: [System specification](./index.md), [Test runs and scopes](./test-runs-and-scopes.md), and [UI catalog host profile](./host-profile.md).
