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

- **Viewport align** — Default `align: "viewport"` pins overlays to the iframe
  origin (Playwright fullPage). Use `align: "canvas"` for `#storybook-root` offset.
- **Auto-select** — First baseline image is selected on `INIT_IMAGE`.
- **Difference blend** — `mix-blend-mode: difference`; defaults to off on load.
- **Pass threshold** — Configurable `%` (default `0.1`).
- **Diff fit** — Pad/crop actual → baseline size instead of stretching.
- **Quiet preset** — No Vite/Webpack console logs.
- **Run Diff capture** — Same-origin preview iframe via `html-to-image`
  (upstream Chrome-extension bridge is unused). Resizes the iframe to the
  baseline PNG size before capture so layout matches Playwright (1280×N),
  not the small manager preview pane. Still approximate vs real Chromium
  screenshots — prefer the overlay for framing.
- **Compact compare** — Chromatic-style modes via Storybook `ToggleButton`:
  Swipe, 2-up, Diff heatmap, Focus (spotlight + zoom to change), Blink
  strobe. Checkerboard stage, hover loupe in Diff/Focus, keyboard
  (`1`/`2`/`3` modes, `F` focus, `B` blink, `←`/`→` swipe nudge). Pass/fail
  stats sit above the stage.
- **Compact toolbar** — Small baseline thumbs + inline opacity/threshold/
  blend controls; **Reset** restores overlay position after drag.
