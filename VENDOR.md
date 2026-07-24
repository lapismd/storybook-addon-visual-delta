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

Storybook compiles the TypeScript/`tsx` entry points directly — there is no
committed `dist/` build. The catalog loads the addon via
`.storybook/visual-delta-preset.ts` (absolute `src/manager.tsx` +
`src/preview.ts`), not the `node_modules` package name, so edits are not
masked by Storybook/Vite ignoring `node_modules`. `pnpm storybook` runs
`scripts/storybook-run.mjs`, which restarts on manager/panel (and related
addon `src/node` + preset) changes — the manager builder is a one-shot
esbuild bundle and does not HMR. Preview overlay edits reload via Vite.

The package owns every runtime dependency used by its preset and middleware.
It must not import UI-repository scripts outside this package. Host repositories
provide commands and paths through `VisualDeltaHostOptions`; both Svelte CSF
and object-style TypeScript/JavaScript CSF are supported.

## Addon vs host boundary

| Owned by the addon package                                                                   | Stays in `@stevejuma/ui` (host)                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Panel / Testing Module UI, overlay, Live Diff                                                | Playwright suite `tests/visual/storybook.spec.ts`        |
| `viteFinal`: middleware (`/__visual-delta/*`), baseline CSF inject, src watch                | `staticDirs` → `/visual-baselines`                       |
| Preview `runStep` + park / `PLAY_STEPS` channel                                              | CLI pipelines `scripts/ui-generator/pipeline/visual-*`   |
| Path constants, source patchers, sidecar/index readers, server readiness, and `fetch` client | CLI orchestration under `scripts/ui-generator/pipeline/` |
| Catalog fixtures + Panel Shell mocks                                                         | Approval gate `VISUAL_UPDATE_APPROVED`                   |

Host `.storybook/main.ts` only registers the local preset and `staticDirs`.
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
- **Soft hide keeps selection** — placement toggle soft-hides without clearing
  `index`; reveal-center matches post create/update.

Storybook title **`Visual Delta/Panel Chrome`** mounts the real React panel
controls via `ReactThemeHost.svelte` (`createRoot` + Storybook light theme) and
interactive fixtures in `src/stories/panel-fixtures.tsx`. Also `skip-visual`
(manager chrome ≠ product UI). Play functions cover placement soft-hide, image
only, review pad, badges, gallery, and accordion.

Storybook title **`Visual Delta/Panel Shell`** mounts an end-to-end panel
harness (`PanelShell` + in-memory mock `/__visual-delta` backend) so Create /
Update / Diff / Run / Cancel / Review can be exercised without Playwright.
Tagged `skip-visual`.

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
  a ghost overlay (opacity / difference blend). Legacy `beside`/`over` map to
  `right`/`center`. Split panes / scroll rails use the live preview’s painted
  background (canvas → body → `--background`), not Storybook chrome
  `--sb-color-bg`.
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
  (`#storybook-root > *`, or body when portals are open), so layout/wrapping
  matches baselines. Still approximate vs real Chromium screenshots.
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
  Playwright starts, a stale listener on static port `6007` is cleared if
  `/index.json` is unhealthy (avoids `EADDRINUSE` create failures). Create for a
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
- **Placement pad hide** — Clicking the active position soft-hides the baseline
  (`visibility: hidden`) without tearing down split panes or unlocking the
  subject width lock, so the live component does not jump. Selection stays;
  click again to show. Persisted as `overlayOn` in localStorage.
- **Image only (eye)** — Unselected by default. When selected: hides the live
  story, the baseline gallery (overlay selector), and the placement pad; forces
  center overlay (still draggable). An “Image only” chip marks the mode in the
  toolbar and preview. Persisted as `liveVisible` in localStorage.
- **Review tags** — When baselines are configured, a button group sets mutually
  exclusive CSF tags via `/__visual-delta/review-status`: `visual-pending`
  (orange clock), `visual-approved` (green shield), `visual-failed` (red ✕).
  Create-baseline also stamps `visual-pending` on newly wired stories that are
  not already approved. **Rewrite/update** baselines always resets matching
  stories to `visual-pending` (clears `visual-approved`).
- **skip-visual** — Panel **More** menu: **Skip visual tests** /
  **Include in visual tests** posts to `/__visual-delta/skip-visual` to add or
  remove the CSF tag on the current story. Adding skip clears review tags.
  Skipped stories are excluded from Playwright / Testing Module runs; review
  and Update baselines stay disabled until included again.
- **Testing module target** — Registers a Storybook `test-provider` that shells
  out to the existing Playwright visual suite (`pnpm test:visual`). Global
  Testing Module shows Vitest-style checklist rows for **Visual Tests** (compare
  only) and **Create Baselines** (missing PNGs + story wiring, or rewrite). A
  single shared status line above the checklist covers both (`Not run` /
  `Testing... N/M` / `Creating…` / `Updating…`, then
  `Tests: Ran N · Baselines: …`). Visual Tests shows an orange status chip while
  running and a failure-count badge beside the chip. Create Baselines is **off by default** (unchecked); enable the row checkbox
  to use the split status control: default **Create missing**, menu
  **Rewrite existing** (overwrite PNGs via `/__visual-delta/update-baseline`).
  Rewrite clears `visual-approved` so the component loses its approved badge
  and returns to `visual-pending`. Create/rewrite runs against leaf stories
  currently listed in the sidebar (search/tag filters), one component family
  at a time. The
  global module has no extra top border (context-menu actions still keep a
  divider). The panel split button shows the same visual-run progress while
  running. Results map to per-story sidebar status dots from compare metrics
  (sidecar `%` / threshold, or panel live Diff). Ephemeral artifacts: gitignored
  `*.json` / `*.actual.png` / `*.diff.png` under
  `tests/visual/storybook.spec.ts-snapshots/`. The panel hydrates its compare
  view from those artifacts when present. Never writes baselines from Run
  Visual Tests.
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
