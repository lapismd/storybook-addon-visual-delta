# Visual Delta (local package)

Reimplemented from **`storybook-addon-visual-delta@0.1.5`** (npm tarball).
Upstream GitHub is unavailable; edit **`src/`** like any other workspace package.

**Chromatic parity:** see [`PARITY.md`](./PARITY.md) for configuration and
manager-view gaps vs `@chromatic-com/storybook` (local-achievable vs cloud-only).

|                 |                                      |
| --------------- | ------------------------------------ |
| Upstream npm    | `storybook-addon-visual-delta@0.1.5` |
| License         | MIT (see `LICENSE`)                  |
| Original author | houjinlong                           |

Storybook compiles the TypeScript/`tsx` manager/preview/preset entries from
`src/` (Vite). The catalog loads those via `.storybook/visual-delta-preset.ts`
(absolute `src/manager.tsx` + `src/preview.ts`), not the `node_modules`
package name, so edits are not masked by Storybook/Vite ignoring
`node_modules`. `pnpm storybook` runs `scripts/storybook-run.mjs`, which
restarts on manager/panel (and related addon `src/node` + preset) changes —
the manager builder is a one-shot esbuild bundle and does not HMR. Preview
overlay edits reload via Vite.

Node consumers (`./playwright`, `./node`, `visual-delta` CLI) must use the
compiled `dist/` build (`pnpm build:node` / `prepare`). Node's type stripper
refuses `.ts` under `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so those package exports
point at `dist/*.js`, not `src/*.ts`. After editing `src/playwright` or
`src/node`, rebuild before Update baselines / `playwright test`.

The package owns every runtime dependency used by its preset and middleware.
It must not import UI-repository scripts outside this package. Host repositories
provide commands and paths through `VisualDeltaHostOptions`; both Svelte CSF
and object-style TypeScript/JavaScript CSF are supported.

## Addon vs host boundary

| Owned by the addon package                                                                                                                                                                  | Stays in `@stevejuma/ui` (host)                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Panel / Testing Module UI, overlay, Live Diff                                                                                                                                               | Playwright suite `tests/visual/storybook.spec.ts`              |
| Preset: `staticDirs`, `viteFinal` (middleware + CSF inject + src watch); package `./manager` + `./preview` auto-loaded by Storybook 10; packaged `visual-delta` CLI + `/playwright` helpers | Committed PNGs + thin Playwright entry (or catalog suite/CLIs) |
| Preview `runStep` + park / `PLAY_STEPS` channel                                                                                                                                             | CLI pipelines `scripts/ui-generator/pipeline/visual-*`         |
| Path constants, source patchers, sidecar/index readers, server readiness, and `fetch` client                                                                                                | CLI orchestration under `scripts/ui-generator/pipeline/`       |
| Catalog fixtures + Panel Shell mocks                                                                                                                                                        | Approval gate `VISUAL_UPDATE_APPROVED`                         |

Host `.storybook/main.ts` registers the local preset (absolute `src/` manager /
preview for HMR) with catalog overrides (`nested-import` + ui-generator CLIs).
Portable consumers use `addons: ["storybook-addon-visual-delta"]` (or
`npx storybook add storybook-addon-visual-delta`) plus `visual-delta init` /
`defineVisualPlaywrightConfig` / `defineVisualSuite`. The panel empty state
offers **Set up Visual Delta** when the suite/config is missing
(`POST /__visual-delta/init`).
Thin re-exports under `.storybook/visual-delta-middleware.ts` /
`visual-baseline-*.ts` remain for gradual migration; prefer
`storybook-addon-visual-delta/node`.

## Catalog regression fixtures

Storybook title **`Visual Delta/Compare Alignment`** (catalog stories in
`../../src/storybook/visual-delta/`, demos in `src/stories/`, tagged
`skip-visual`) exercises the same pure helpers the preview overlay and panel
use:

- **Subject with vertical margin** — canvas pad 24 + subject `my-2` (8) →
  baseline pane padding-top 32; play asserts Δ top ≈ 0.
- **Subject without margin** — padding-top 24; Δ top ≈ 0.
- **Baseline chip on overlay placements** — `OverlayChipDemo` mounts the same
  `ensureOverlayChip` helper as the preview for left/right/above/below (split)
  and center; play asserts five visible “Baseline” chips on the overlay image
  (not the live pane).
- **Soft hide keeps selection** — placement toggle soft-hides without clearing
  `index` or placement; pad shows nothing pressed and preview tears down
  overlay/split DOM so the live subject unlocks to natural width/height.
  Clicking the same placement again soft-shows. Reveal-center matches post
  create/update. Preview channel handlers go through a mutable API bag so Vite
  HMR cannot leave a stale soft-hide listener that only toggled visibility.
- **Docs clears overlay** — leaving Canvas (`viewMode !== "story"`) hard-clears
  preview overlay/split DOM (manager `SELECT_IMAGE(-1)` + preview Docs/SET_CURRENT_STORY
  listeners) so baseline PNGs cannot linger on the Docs page.
- **Playwright DiffResult hydrate** — panel loads gitignored sidecar
  `.json` / `.actual.png` / `.diff.png` under `/visual-baselines` on story load
  (not localStorage). Failed/missing fetches do not poison the in-memory cache.
- **INIT after soft-hide** — `initImageSelection` keeps gallery `index` when
  baselines exist even if persisted `overlayOn` is false, so Diff / DiffResult
  still resolve `baselineStem` (panel body is not toolbar-only).
- **Accordion compare fill** — `PanelShell` absolutely fills the AddonPanel;
  expanded `SectionBody` completes the PanelBody → List → Section flex chain
  (`flex: 1`, `minHeight: 0`, `overflow: auto`) so placement toolbar stays above
  2-up tabs. Compare / DiffResult use `flex: 1 1 auto` with
  `minHeight: min-content` so the stage fills leftover height without collapsing
  to a nested 0-height scrollport; overflow scrolls inside `SectionBody` (no
  scroll-past-toolbar / auto review layout). Swipe/Diff/Focus/Blink share one
  aspect-locked stage so baseline and new stay pixel-aligned.
- **Playwright sidecar artifacts** — portable `defineVisualSuite` writes
  gitignored `*.json` / `*.actual.png` / `*.diff.png` beside baselines so the
  panel reloads DiffResult after a backend compare without re-running live Diff.

Storybook title **`Visual Delta/Panel Chrome`** mounts the real React panel
controls via `ReactThemeHost.svelte` (`createRoot` + Storybook light theme) and
interactive fixtures in `src/stories/panel-fixtures.tsx`. Also `skip-visual`
(manager chrome ≠ product UI). Play functions cover placement soft-hide, image
only, review pad, badges, gallery, and accordion.

Storybook title **`Visual Delta/Panel Shell`** mounts an end-to-end panel
harness (`PanelShell` + in-memory mock `/__visual-delta` backend) so Create /
Update / Diff / Run / Cancel / Review can be exercised without Playwright.
Tagged `skip-visual`.

Storybook title **`Visual Delta/Testing Module`** mounts the shared checklist
via `TestingModuleShell` (global + sidebar context variants). Play covers
defaults (compare on, baselines/status off, Create missing mode) and scoped
context-menu parity. Tagged `skip-visual`.

Run via Storybook Vitest / `pnpm test:storybook` (filter the title as needed).

## Unit / component tests

Vitest project **`visual-delta`** (`pnpm test:unit`) covers:

- Pure helpers colocated as `*.spec.ts` under `src/` (placement, insets,
  overlay session, normalize, baseline URLs, settings, diff-assets, …)
- React panel/manager controls via Testing Library (`*.spec.tsx`) with a
  Storybook light-theme wrapper — not catalog stories (manager UI is React;
  the product catalog is Svelte-only)

Setup: `src/test/setup.ts` + `src/test/render.tsx`.

## Local behavior (vs upstream 0.1.5)

- **Placement** — Five-way pad (↑ ↓ ← → ·): left/right/above/below put live +
  baseline in equal compare panes sized from the baseline CSS dimensions plus
  pad (`VISUAL_COMPARE_PANE_PAD_PX`), with shared 2D scroll (vertical +
  horizontal rails, pane scroll mirroring, shift+wheel → X). Both panes get a
  matching min scroll extent (max of live vs baseline content, at least the
  baseline CSS box) so a short/narrow side cannot clamp scroll before the larger
  side is fully reachable. Side-by-side panes fill the preview height (stacked
  panes fill width) and size for storybook-root padding, so unused iframe space
  is not left empty while inner scroll rails appear. Live `#storybook-root`
  `min-height: 100vh` is suppressed in split mode; subject width stays locked to
  the baseline CSS width. Split baseline panes mirror canvas padding **and**
  the subject’s margins (e.g. `my-2`) so side-by-side tops align. Center stacks
  a ghost overlay (opacity / difference blend on the PNG only). A
  “Baseline” chip (same chrome as Image-only, top-left on the overlay so it
  follows drag) marks the overlay vs live.
  Legacy `beside`/`over` map to `right`/`center`. Split panes / scroll rails use
  the live preview’s painted background (canvas → body → `--background`), not
  Storybook chrome `--sb-color-bg`.
- **Canvas align** — Shadcn baselines use `align: "canvas"` so component-clipped
  PNGs pin (via CSS transform) to the story subject (`#storybook-root > *`),
  matching Playwright clips. Legacy `align: "viewport"` pins to the iframe
  origin with transforms only — no iframe resize. Center overlay also locks the
  live subject to the baseline CSS width (same as split) so a narrow addon
  panel does not reflow the component under a wider capture.
- **Auto-select** — First baseline image is selected on `INIT_IMAGE`.
- **Difference blend** — `mix-blend-mode: difference`; defaults to off on load;
  only applies in `over` placement.
- **Pass threshold** — Configurable `%` (default `0.1`).
- **Diff fit** — Pad/crop actual → baseline size instead of stretching.
- **Quiet preset** — No Vite/Webpack console logs.
- **Run Diff capture** — Forces the preview iframe to the Playwright viewport
  (`1280×900`) before `html-to-image` of the story subject
  (`#storybook-root > *`, or body cropped to the subject+portal union when
  menus/dialogs are open), so layout/wrapping matches baselines. Still
  approximate vs real Chromium screenshots. Portal clips use the story
  subject box — not `#storybook-root` (`min-height: 100vh`) — so open
  popovers do not explode to a full-viewport PNG.
- **Create + skip-visual** — `visual-delta update --create-only` removes
  `skip-visual` from CSF **and** `storybook-static/index.json` so Playwright
  still sees the story under `--skip-build`. Testing Module **Rebuild
  static**, panel kebab **Rebuild storybook static**, or CLI `--rebuild`
  forces `build-storybook` (kebab runs build only via
  `/__visual-delta/rebuild-static`; the checkbox/CLI flag rebuilds before
  capture). Create fails if the expected PNG was not written (no more silent
  `No tests found` + exit 0).
- **Agent commits** — After each verified slice of work in this package,
  commit with `jj` immediately (do not leave finished plugin changes only in
  `@`).
- **Compact compare** — Chromatic-style modes via Storybook `ToggleButton`:
  Swipe, 2-up, Diff heatmap, Focus (spotlight + zoom to change), Blink
  strobe. Checkerboard stage, hover loupe in Diff/Focus, keyboard
  (`1`/`2`/`3` modes, `F` focus, `B` blink, `←`/`→` swipe nudge). Pass/fail
  stats sit above the stage.
- **Compact toolbar** — Baseline thumbs + Beside/Over on the first row;
  opacity/threshold/blend on the second. **Reset** restores drag position;
  **Reset settings** clears localStorage prefs.
- **Create baselines** — When the panel has no configured images, a centered
  **Create Baseline** CTA posts to `/__visual-delta/create-baseline` (also on
  the sidebar story/component context menu under **Run visual tests**). Runs
  `visual-update --create-only` (`updateSnapshots: "missing"` — never overwrites
  existing PNGs), then patches the matching `.stories.svelte` so
  `parameters.visualDelta.images` includes the new `/visual-baselines/…` URL when
  missing. Progress shows in the panel status bar (**Creating…**, spinner +
  clipped last log line; click for the full monospace log popover). Before
  Playwright starts, a stale listener on the visual static port
  (`STORYBOOK_PORT + 1` by default) is cleared if `/index.json` is unhealthy
  (avoids `EADDRINUSE` create failures). Create for a
  component (or any leaf under it) removes `skip-visual` from every story under
  that Playwright id prefix, rebuilds the static index when needed, captures
  missing PNGs, then wires `visualDelta.images`. When CSF was already wired (no
  HMR), the panel hydrates the baseline URL so the gallery is not left empty.
- **Update baselines** — Dev-only kebab action posts to
  `/__visual-delta/update-baseline`, which runs the guarded visual-update
  pipeline for the current component (rebuilds Storybook, overwrites PNGs).
  Logs stream into the panel status bar like create (progress button +
  popover); on success the panel enables a center overlay with the refreshed
  baseline. Log popovers use monospace.
- **Rebuild storybook static** — Dev-only kebab action posts to
  `/__visual-delta/rebuild-static` and runs `pnpm build-storybook` only (no
  Playwright capture). Use after CSS/markup edits when you want a fresh
  static tree before the next create/update/compare. Progress uses the same
  status-bar log channel as create/update.
- **Placement pad hide** — Clicking the active position soft-hides the baseline
  by tearing down overlay + split panes and unlocking subject width / canvas
  height locks (natural viewport) while keeping gallery `index` and placement
  so click-again rebuilds. Pad shows no pressed cell while hidden. Persisted as
  `overlayOn` in localStorage. Story changes clear selection so a story without
  baselines does not keep showing the previous PNG.
- **Image only (eye)** — Unselected by default. When selected: hides the live
  story, the baseline gallery (overlay selector), and the placement pad; forces
  center overlay (still draggable). An “Image only” chip marks the mode in the
  toolbar and preview. Persisted as `liveVisible` in localStorage.
- **Review tags** — Mutually exclusive CSF tags via `/__visual-delta/review-status`:
  `visual-pending` (orange clock), `visual-ready` (blue flag), `visual-approved`
  (green shield), `visual-failed` (red ✕). Accept / Unaccept set approved /
  pending; the panel pad toggles ready / failed (agents mark `visual-ready`
  when work is ready for human review). Create/update baselines stamp
  `visual-ready` and clear sibling review tags (`visual-pending`,
  `visual-approved`, `visual-failed`). Tag patchers always normalize via
  `normalizeVisualStoryTags` and sync `storybook-static/index.json`.
- **skip-visual** — Panel **More** menu: **Skip visual tests** /
  **Include in visual tests** posts to `/__visual-delta/skip-visual` to add or
  remove the CSF tag on the current story. Adding skip clears review tags.
  Skipped stories are excluded from Playwright / Testing Module runs; review
  and Update baselines stay disabled until included again.
- **Testing module target** — Registers a Storybook `test-provider` that shells
  out to the existing Playwright visual suite (`pnpm test:visual`). Global
  Testing Module heading: **Run visual tests** with a streamed single-line
  status under it (same last-log-line behavior as the panel status bar;
  idle shows `Not run` / summary) and a **play** split (Create missing /
  Rewrite existing; **Create missing** default). Checklist: compare (on by
  default), **Create missing Baselines** / **Update baselines** (off by
  default), **Update status** (off by default; pass → `visual-ready`,
  fail → `visual-failed`), and **Rebuild static** (off — forces
  `build-storybook` before capture). While running, each checked row shows
  `completed/total` under the checkbox (compare = stories in scope; baselines
  = component targets; status = result count). The same checklist is used for
  the sidebar story/component context menu (scoped to that entry). Heading
  play / Storybook **Run tests** execute checked rows (baselines → compare →
  status). With nothing checked, play is disabled. Rewrite clears
  `visual-approved` / `visual-ready`. Global writes use sidebar leaf stories;
  context menu uses the selected story/component leaves. Results map to
  sidebar status dots. Ephemeral artifacts: gitignored `*.json` /
  `*.actual.png` / `*.diff.png` under
  `tests/visual/storybook.spec.ts-snapshots/`.
- **Playwright pass threshold** — Package-wide default lives in host
  `.visual-delta/playwright.json` (`passThresholdPercent`, default 1%).
  `defineVisualPlaywrightConfig` reads it. Panel Diff Chromium shows a
  mismatch note under Thresh, plus a split control: **Update Playwright**
  (`POST /__visual-delta/playwright-threshold`) and a reset icon that copies
  the Playwright value into local Thresh prefs.
- **Capture parity with Playwright** — Live Diff blurs the preview's active
  element and temporarily disables animations/transitions/caret (same prep as
  `tests/visual/storybook.spec.ts`) before `html-to-image` capture, so play
  focus rings (e.g. Accordion) do not inflate the pixelmatch %. Size mismatch
  uses center pad/crop to match sidecar `fitRgba`.
- **Hi-DPI baselines** — PNGs are captured at `deviceScaleFactor: 3` with
  Playwright `scale: "device"`; the overlay sizes them to CSS pixels so they
  still align with the live subject.
- **Persisted prefs** — Overlay on/off, placement, live visibility, opacity,
  blend, and threshold are stored in `localStorage` and reapplied across stories.
- **Interaction baselines (opt-in)** — Primary Default-tab PNG stays end-of-play.
  The Interactions tab lists rows from (1) `parameters.visualDelta.interactions`
  (always, once wired), (2) preview `runStep` → `PLAY_STEPS` channel events, and
  (3) the Storybook instrumenter when available. **Create** / **Update** writes
  `{slug}--{stepId}-chromium-darwin.png`, parks play via `?visualCaptureUntil=`
  (or a session flag for live remount), and patches CSF. Selecting a step uses
  instrumenter GOTO when a callId exists, otherwise remount + park.
