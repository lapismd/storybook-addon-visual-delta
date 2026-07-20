# Visual Delta (local package)

Reimplemented from **`storybook-addon-visual-delta@0.1.5`** (npm tarball).
Upstream GitHub is unavailable; edit **`src/`** like any other workspace package.

| | |
| --- | --- |
| Upstream npm | `storybook-addon-visual-delta@0.1.5` |
| License | MIT (see `LICENSE`) |
| Original author | houjinlong |

Storybook compiles the TypeScript/`tsx` entry points directly — there is no
committed `dist/` build.

## Local behavior (vs upstream 0.1.5)

- **Placement** — Five-way pad (↑ ↓ ← → ·): left/right/above/below put live +
  baseline in a shared 50:50 scrollable split; center stacks a ghost overlay
  (opacity / difference blend). Legacy `beside`/`over` map to `right`/`center`.
  Split panes / scroll rail use the live preview’s painted background (canvas →
  body → `--background`), not Storybook chrome `--sb-color-bg`.
- **Canvas align** — Shadcn baselines use `align: "canvas"` so component-clipped
  PNGs pin (via CSS transform) to the story subject (`#storybook-root > *`),
  matching Playwright clips. Legacy `align: "viewport"` pins to the iframe
  origin with transforms only — no iframe resize.
- **Auto-select** — First baseline image is selected on `INIT_IMAGE`.
- **Difference blend** — `mix-blend-mode: difference`; defaults to off on load;
  only applies in `over` placement.
- **Pass threshold** — Configurable `%` (default `0.1`).
- **Diff fit** — Pad/crop actual → baseline size instead of stretching.
- **Quiet preset** — No Vite/Webpack console logs.
- **Run Diff capture** — Same-origin preview via `html-to-image` of the story
  subject (`#storybook-root > *`, or body when portals are open), matching
  Playwright component clips. Still approximate vs real Chromium screenshots.
- **Compact compare** — Chromatic-style modes via Storybook `ToggleButton`:
  Swipe, 2-up, Diff heatmap, Focus (spotlight + zoom to change), Blink
  strobe. Checkerboard stage, hover loupe in Diff/Focus, keyboard
  (`1`/`2`/`3` modes, `F` focus, `B` blink, `←`/`→` swipe nudge). Pass/fail
  stats sit above the stage.
- **Compact toolbar** — Baseline thumbs + Beside/Over on the first row;
  opacity/threshold/blend on the second. **Reset** restores drag position;
  **Reset settings** clears localStorage prefs.
- **Update baselines** — Dev-only button posts to
  `/__visual-delta/update-baseline`, which runs the guarded visual-update
  pipeline for the current component (rebuilds Storybook, writes PNGs).
- **Testing module target** — Registers a Storybook `test-provider` that shells
  out to the existing Playwright visual suite (`pnpm test:visual`). Global
  Testing Module shows a Vitest-style **Visual Tests** checklist row with live
  `Testing... N/M` progress (NDJSON stream from middleware), an orange status
  chip while running, and a failure-count badge beside the chip; the panel
  split button shows the same progress while running. Results map to per-story
  sidebar status dots from compare metrics (sidecar `%` / threshold, or panel
  live Diff). Ephemeral artifacts: gitignored `*.json` / `*.actual.png` /
  `*.diff.png` under `tests/visual/storybook.spec.ts-snapshots/`. The panel
  hydrates its compare view from those artifacts when present. Never writes
  baselines from Run Visual Tests.
- **Capture parity with Playwright** — Live Diff blurs the preview's active
  element and temporarily disables animations/transitions/caret (same prep as
  `tests/visual/storybook.spec.ts`) before `html-to-image` capture, so play
  focus rings (e.g. Accordion) do not inflate the pixelmatch %. Size mismatch
  uses center pad/crop to match sidecar `fitRgba`.
- **Hi-DPI baselines** — PNGs are captured at `deviceScaleFactor: 3` with
  Playwright `scale: "device"`; the overlay sizes them to CSS pixels so they
  still align with the live subject.
- **Persisted prefs** — Overlay on/off, placement, opacity, blend, and
  threshold are stored in `localStorage` and reapplied across stories.
