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
  `minHeight: min-content` and a 300px tab viewport so the stage fills leftover
  height without collapsing to a nested 0-height scrollport; overflow scrolls
  inside `SectionBody` (no scroll-past-toolbar / auto review layout).
  Swipe/Diff/Focus/Blink share one aspect-locked stage so baseline and new stay
  pixel-aligned. 2-up keeps equal Baseline/New panes visible at every zoom and
  mirrors pane or shared-rail scrolling on both axes.
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

The panel's **More → Configuration** surface starts with the exact current
story. It shows effective setting sources, writes only changed allow-listed
`parameters.visualDelta` values, can remove story overrides, and reports
high-confidence alignment metadata mismatches. Its one-click alignment repair
changes story metadata only; it does not rewrite the baseline PNG or review
status. The normal comparison surface also shows the mismatch in the geometry
warning area, with a direct link to that Story tab.

The Configuration **Workflow** tab adds two default-off local workflows:
successful authoritative single-story Chromium comparisons may auto-approve
their exact owning story, and UI-driven mutations may be grouped for VCS
review or automatic commit. The latter requires both project opt-in and the
host `allowVcsWrites` gate; changing this policy is itself always review-only.
Legacy flat `.visual-delta/config.json` files remain valid.

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
  panel does not reflow the component under a wider capture. A baseline whose
  CSS dimensions match its declared capture viewport is also inferred to be a
  viewport capture, even if older metadata says `align: "canvas"`; center and
  split placement use the viewport origin and omit the false geometry warning.
- **Auto-select** — First baseline image is selected on `INIT_IMAGE`.
- **Difference blend** — `mix-blend-mode: difference`; defaults to off on load;
  only applies in `over` placement.
- **Pass threshold** — Configurable `%` (default `0.1`).
- **Diff fit** — Pad/crop actual → baseline size instead of stretching.
- **Canonical result evidence** — New writes use sidecar v2: independent runner
  status and classified outcome, original captured dimensions, comparison
  metrics, baseline/config hashes, and operation ID. v1 remains readable, but
  only hash-current evidence can drive the panel header or a later status-only
  run. Runner failures and dimension mismatches cannot become passes because
  fitted pixels happen to match. Review tags are metadata, not Playwright
  expectations.
- **Quiet preset** — No Vite/Webpack console logs.
- **Run Diff capture** — Forces the preview iframe to the Playwright viewport
  (`1280×900`) before `html-to-image` of the story subject
  (`#storybook-root > *`, or body cropped to the subject+portal union when
  menus/dialogs are open), so layout/wrapping matches baselines. Still
  approximate vs real Chromium screenshots. Portal clips use the story
  subject box — not `#storybook-root` (`min-height: 100vh`) — so open
  popovers do not explode to a full-viewport PNG. A preview iframe replacement
  during measurement/capture retries once against the current frame instead of
  waiting on detached geometry.
- **Create + skip-visual** — `visual-delta update --create-only` removes
  `skip-visual` from CSF **and** `storybook-static/index.json` so Playwright
  still sees the story under `--skip-build`. The panel kebab **Rebuild
  storybook static** or CLI `--rebuild` forces `build-storybook`. All static
  consumers share one decision service that checks output health, source/import
  freshness, effective config, affected graph/cache validity, and eligibility
  changes. A single-flight lock/freshness token prevents duplicate preflight/run
  builds. Create fails if the expected PNG was not written (no more silent
  `No tests found` + exit 0).
- **Observable global preflight** — `/__visual-delta/action-scope` streams
  resolving, static-rebuild heartbeat, and exact-scope freezing milestones as
  NDJSON. The Testing Module keeps comparison progress idle during this
  preflight and starts it only when `/run-tests` opens. Run streams open before
  the rebuild decision, report its reason, heartbeat during slow work, and end
  with an explicit success/error event.
- **Agent commits** — After each verified slice of work in this package,
  commit with `jj` immediately (do not leave finished plugin changes only in
  `@`).
- **Compact compare** — Chromatic-style modes via Storybook `ToggleButton`:
  Swipe, 2-up, Diff heatmap, Focus (spotlight + zoom to change), Blink
  strobe. Checkerboard stage, hover loupe in Diff/Focus, keyboard
  (`1`/`2`/`3` modes, `F` focus, `B` blink, `←`/`→` swipe nudge). Pass/fail
  stats sit above the stage. Diff results open at native 100% by default;
  project-configured Fit still responds to panel size. Image lightboxes also
  open at native size, center on each non-overflowing axis, scroll on larger
  axes, and retain an explicit measured Fit control.
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
  explicit component removes `skip-visual` from stories under that component;
  an exact story-ID batch only changes the supplied stories. The flow rebuilds
  the static index when needed, captures missing PNGs, then wires
  `visualDelta.images`. When CSF was already wired (no HMR), the panel hydrates
  the baseline URL so the gallery is not left empty.
- **Update baseline** — The concrete baseline accordion kebab posts to
  `/__visual-delta/update-baseline`, which runs the guarded visual-update
  pipeline for exactly the open story. Repeated exact `--story-id` values
  support Testing Module batches; only explicit `--component` operations may
  use component-prefix selection.
  Logs stream into the panel status bar like create (progress button +
  popover); on success the panel enables a center overlay with the refreshed
  baseline. Log popovers use monospace.
- **Delete screenshot** — The same accordion kebab posts the exact story ID and
  selected baseline URL to `/__visual-delta/delete-baseline`. The middleware
  validates that the nested/flat snapshot path belongs to that story, removes
  only its matching `visualDelta.images`, named-mode `src`, or interaction
  entry, invalidates that comparison/geometry evidence, and deletes the local
  PNG plus `.actual.png`, `.diff.png`, and `.json` artifacts when present.
  Independent review metadata and siblings remain unchanged.
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
  when work is ready for human review). Create/update baselines reset exactly
  their written story IDs to `visual-pending` and invalidate prior comparison
  evidence. Only explicit comparison/status/review actions produce ready,
  failed, or approved states. Tag patchers normalize via
  `normalizeVisualStoryTags` and sync `storybook-static/index.json`.
- **skip-visual** — Panel **More** menu: **Skip visual tests** /
  **Include in visual tests** posts to `/__visual-delta/skip-visual` to add or
  remove the CSF tag on the current story. It invalidates result eligibility
  and marks static output stale for the next static consumer while preserving
  independent review metadata. Skipped stories are excluded from Playwright /
  Testing Module runs; review and Update baselines stay disabled until included
  again.
- **Testing module target** — Registers a Storybook `test-provider` that shells
  out to the existing Playwright visual suite (`pnpm test:visual`). Global
  Testing Module heading: **Run visual tests** with a streamed single-line
  status under it (same last-log-line behavior as the panel status bar;
  idle shows `Not run` / summary) and a **play** split (Create missing /
  Rewrite existing; **Create missing** default). Checklist: compare (on by
  default), **Create missing Baselines** / **Update baselines** (off by
  default), and **Update status** (off by default; pass → `visual-ready`,
  fail → `visual-failed`). Rows are ordered baseline write → compare →
  global-only Affected → status. While running, each checked row shows
  `completed/total` under the checkbox (compare = stories in scope; baselines
  = exact story IDs; status = result count). The same checklist is used for
  the sidebar story/component context menu. Heading play / Storybook **Run
  tests** freeze one exact scope and execute checked rows (baselines → compare
  → status). A story context contains one story, a component context contains
  all descendants, global contains the filtered sidebar leaves, and global
  Affected is `visible ∩ refreshed affected`. Empty scopes never broaden.
  Rewrite resets only the exact rewritten IDs to `visual-pending`. Panel
  Accept, Unaccept, Ready, and Failed call review endpoints directly and ignore
  these preferences. Selected runs use escaped story-ID suffix filters; reporter
  `›` separators are presentation only and are never included in Playwright's
  internal grep expression. Results map to sidebar status dots. Ephemeral artifacts:
  gitignored `*.json` /
  `*.actual.png` / `*.diff.png` under
  `tests/visual/storybook.spec.ts-snapshots/`.
- **Effective capture configuration** — Official live and static comparisons
  resolve the same project/story alignment, viewport, pass/pixel thresholds,
  anti-aliasing, delay, crop, ignore selectors, mode globals, and interaction
  key. The legacy `.visual-delta/playwright.json` pass threshold remains a
  fallback only. Opacity, blend, and overlay placement stay local presentation
  preferences.
- **Exact live Chromium comparison** — Panel **Story** and **Diff Chromium**
  both post the same request to `/__visual-delta/compare-story`, wait for play,
  publish the same official result, and never build static Storybook. Diff HTML
  remains a preview-only approximation and cannot update result or review
  state. With workflow auto-accept enabled, only a fresh pass or tolerance pass
  adds `visual-approved` to the exact story (modes and interactions retain their
  owning story’s review scope). The comparison outcome is returned independently
  if the review or its VCS commit fails.
- **Change review + VCS writes** — UI-driven baseline, interaction, review,
  batch-status, skip/include, story/project configuration, Playwright-threshold,
  and initialization mutations pass through one change-set transaction layer.
  **Changes** is available from the panel kebab with a pending badge and shows
  operations, safety diagnostics, unified text diffs, and PNG before/after/diff
  previews. `review` mode opens it after mutation; `auto` commits safe groups
  without navigation. Diff/capture, history reads, affected preflight, and
  static rebuilds are excluded.
- **Commit safety** — Jujutsu is preferred, Git is the fallback, and both use
  argument-array exact pathspecs. Change sets are atomic; pre-existing edits on
  touched paths, unexpected mutations, failures, post-capture file drift, or a
  changed base revision block the whole commit. Unrelated working-copy/staged
  changes are preserved. The addon never pushes, amends, squashes, creates
  branches, signs, discards, reverts, or performs partial commits. Bounded
  review data persists under ignored `.cache/visual-delta/change-sets/`.
- **Warning lifecycle** — Geometry/alignment diagnostics are keyed by baseline
  revision plus effective config. Baseline/config changes clear them first,
  cache-bust the image, and remeasure after story/fonts/layout settle. Failure
  to measure produces a retryable unavailable state, never a retained mismatch.
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
  (3) every top-level Storybook instrumenter row. A GOTO selection in
  Storybook’s Interactions panel selects and expands the same Visual Delta
  accordion. The default list shows wired baselines only; **Show all** reveals
  uncaptured rows. Call titles resolve nested Storybook call references and use
  the same syntax-color vocabulary as the Interactions panel, including the
  complete expectation. **Create** / **Update** writes
  `{slug}--{interactionId}-chromium-darwin.png`, replays an ordinary row through
  its exact deterministic instrumenter call, and patches CSF. Named `step()`
  groups keep using `?visualCaptureUntil=` (or a session flag for live remount).
