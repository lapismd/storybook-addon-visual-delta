# storybook-addon-visual-delta

Storybook addon for comparing stories to committed baseline PNGs: placement pad,
overlay / heatmap Live Diff, Create / Update baselines, Run visual tests, and
review tags.

See [`VENDOR.md`](./VENDOR.md) for implementation history and behavior notes.
Storybook loads TypeScript/`tsx` from `src/` (no committed manager/preview
`dist/`). The Node CLI builds to `dist/node/` (`visual-delta` bin).

## Quick start (portable host)

### Option A — Storybook add + init (recommended)

```bash
# From a Vite Storybook project that already has react
npx storybook add storybook-addon-visual-delta
pnpm add -D playwright
pnpm exec playwright install chromium
pnpm exec visual-delta init
```

`storybook add` registers the addon in `.storybook/main.ts`. `visual-delta init`
writes the thin suite, Playwright config, snapshot dir, and package scripts.
Peers: `storybook`, `react`, `vite` (for `viteFinal`), and `playwright` for the
suite / Diff Chromium / CLI.

Then open Storybook → **Visual Delta** → **Create visual** on a story.

If the panel empty state says the suite is missing, click **Set up Visual Delta**
(same as `visual-delta init` via `/__visual-delta/init`).

### Option B — Manual three files

```bash
pnpm add -D storybook-addon-visual-delta playwright react
pnpm exec playwright install chromium
```

```ts
// .storybook/main.ts
addons: ["storybook-addon-visual-delta"],
```

```ts
// tests/visual/storybook.spec.ts
import { defineVisualSuite } from "storybook-addon-visual-delta/playwright";
defineVisualSuite();
```

```ts
// playwright.config.ts
import { defineVisualPlaywrightConfig } from "storybook-addon-visual-delta/playwright";
export default defineVisualPlaywrightConfig();
```

```json
{
  "scripts": {
    "build-storybook": "storybook build",
    "test:visual": "playwright test",
    "visual-delta": "visual-delta"
  }
}
```

What the package preset wires for you:

| Preset hook                             | Effect                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `managerEntries` / `previewAnnotations` | Panel, Testing Module, overlay                                           |
| `staticDirs`                            | Serves `tests/visual/storybook.spec.ts-snapshots` at `/visual-baselines` |
| `viteFinal`                             | `/__visual-delta/*` middleware + CSF baseline inject                     |

Defaults (override via `options.visualDelta`):

| Concern             | Default                                           |
| ------------------- | ------------------------------------------------- |
| Snapshot directory  | `tests/visual/storybook.spec.ts-snapshots`        |
| Path mode           | `story-id` (flat `{storyId}-chromium-darwin.png`) |
| Create / update CLI | `pnpm exec visual-delta update …`                 |
| Interaction CLI     | `pnpm exec visual-delta interaction-update …`     |
| Compare run         | `pnpm exec playwright test`                       |

Baseline URLs look like `/visual-baselines/<story-id>-chromium-darwin.png`.

## Requirements

| Peer         | Notes                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| `storybook`  | Manager + preview annotations                                             |
| `react`      | Manager / panel UI                                                        |
| `vite`       | Needed for `viteFinal` (middleware + CSF inject) on Vite Storybook hosts  |
| `playwright` | Optional peer — required for Diff Chromium, suite, and `visual-delta` CLI |

You still commit PNGs under the snapshot dir and keep a thin Playwright entry
(or a custom suite). Tag-badge chrome for review tags is optional host polish.

## Install

```bash
pnpm add -D storybook-addon-visual-delta
```

### Package exports

| Import                                        | Purpose                                                           |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `storybook-addon-visual-delta`                | Package root                                                      |
| `storybook-addon-visual-delta/preset`         | `managerEntries`, `previewAnnotations`, `staticDirs`, `viteFinal` |
| `storybook-addon-visual-delta/preview`        | Overlay + `runStep` / park                                        |
| `storybook-addon-visual-delta/manager`        | Panel + Testing Module + review-layout tool                       |
| `storybook-addon-visual-delta/playwright`     | `defineVisualSuite` + Playwright config helpers                   |
| `storybook-addon-visual-delta/node`           | Middleware, inject plugins, CLI runners (Node)                    |
| `storybook-addon-visual-delta/visual-capture` | Mid-play capture helper                                           |

Bin: `visual-delta` → `init` / `update` / `interaction-update`.

## Storybook configuration

### Register the addon

Bare registration (recommended for new projects):

```ts
// .storybook/main.ts
addons: ["storybook-addon-visual-delta"],
```

With options:

```ts
addons: [
  {
    name: "storybook-addon-visual-delta",
    options: {
      visualDelta: {
        // optional — see Options
        snapshotDir: "tests/visual/storybook.spec.ts-snapshots",
        baselinePathMode: "story-id",
      },
    },
  },
],
```

`staticDirs` for `/visual-baselines` is registered by the preset. You only need
a host `staticDirs` entry if you map a different snapshot path yourself (the
preset skips when `/visual-baselines` is already mapped).

### Preview

No host preview changes are required for Visual Delta. The addon’s `preview`
annotation installs the overlay channel, `RUN_UNTIL_STEP` / `runStep`, and
decorators. Keep theme / a11y / globals in your own `.storybook/preview.ts`.

### What `viteFinal` registers

1. **Baseline CSF inject** — adds `parameters.visualDelta` when matching PNGs exist under `snapshotDir`
2. **Dev middleware** — `/__visual-delta/*` (create / update / interaction / run / cancel / review)
3. **Source watch** — when `addonSrcDir` is set (preview HMR while editing the addon)

Skipped when `process.env.VITEST` is set (Storybook Vitest browser runs).

### Middleware routes

| Method | Path                                          | Action                                                  |
| ------ | --------------------------------------------- | ------------------------------------------------------- |
| `POST` | `/__visual-delta/create-baseline`             | Create missing baselines + CSF wiring                   |
| `POST` | `/__visual-delta/update-baseline`             | Overwrite baselines                                     |
| `POST` | `/__visual-delta/create-interaction-baseline` | Mid-play step capture                                   |
| `POST` | `/__visual-delta/capture-subject`             | Diff Chromium subject PNG (NDJSON progress)             |
| `POST` | `/__visual-delta/run-tests`                   | Compare-only Playwright run (NDJSON stream)             |
| `GET`  | `/__visual-delta/run-events`                  | Replay / continue an in-flight or recent run            |
| `GET`  | `/__visual-delta/run-status`                  | Lightweight phase/progress for active/last run          |
| `POST` | `/__visual-delta/cancel-tests`                | Abort an in-flight run                                  |
| `POST` | `/__visual-delta/review-status`               | Set CSF review tags (`storyId`+`status` or `updates[]`) |
| `POST` | `/__visual-delta/skip-visual`                 | Add or remove `skip-visual` on a story                  |

Create / update spawn `pnpm <visualUpdateArgs…>` with appended flags:

- `--create-only` on create
- `--component <name>` or `--story-id <id>`

Interaction writes spawn `pnpm <visualInteractionUpdateArgs…>` with:

- `--create-only` unless overwrite
- `--story-id`, `--step-label`, and optional `--step-id`

Run-tests uses `pnpm <visualTestArgs…>` (optional `-g` grep from story ids)
and may call `pnpm build-storybook` first when `allowRebuild` is enabled and
`storybook-static` is incomplete/stale (missing `index.json` or `iframe.html`,
or the client requests a rebuild). Progress is streamed with a **list-only**
Playwright reporter so the Testing Module can show live `Testing N/M` counts.
After HMR remounts the Testing Module (e.g. Update status), the client
reconnects via `/run-status` + `/run-events` instead of losing progress.

## Options (`VisualDeltaHostOptions`)

Pass under addon `options.visualDelta`. Types from
`storybook-addon-visual-delta/preset` or `…/node`.

| Option                        | Default                                    | Purpose                                                     |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `root`                        | Vite `config.root` / `process.cwd()`       | Spawn cwd and path resolution                               |
| `snapshotDir`                 | `tests/visual/storybook.spec.ts-snapshots` | Absolute or root-relative PNG directory                     |
| `baselinePathMode`            | `story-id`                                 | Flat story-id PNGs, or `nested-import` for folder layouts   |
| `addonSrcDir`                 | Addon `src/`                               | Vite watch root for addon preview HMR                       |
| `visualUpdateArgs`            | `exec visual-delta update …`               | Argv after `pnpm` for primary baseline writes               |
| `visualInteractionUpdateArgs` | `exec visual-delta interaction-update …`   | Argv after `pnpm` for mid-play captures                     |
| `visualTestArgs`              | `exec playwright test`                     | Argv after `pnpm` for compare-only runs                     |
| `visualServerPort`            | `6007`                                     | Static Storybook port owned by the visual Playwright config |
| `allowRebuild`                | `true` (unless set `false`)                | Allow `build-storybook` before run-tests                    |

The middleware, story-index reader, sidecar resolver, source patchers, and
Playwright-server readiness checks are package-owned. A packed or file-linked
consumer does not need the UI repository's `scripts/` tree.

The source patcher supports both Svelte CSF (`.stories.svelte`) and object-style
TypeScript/JavaScript CSF (`.stories.ts`, `.tsx`, `.js`, `.jsx`). Review and
skip actions preserve the rest of the exported story object.

An image entry can override the capture metadata used by overlay sizing and
live diff:

```ts
parameters: {
  visualDelta: {
    images: [
      "/visual-baselines/current-chromium-darwin.png",
      {
        src: "/lapis-reference/workspace-shell-light.png",
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 960 },
      },
    ],
  },
}
```

### Default CLI argv

Portable defaults use the packaged bin:

```ts
visualUpdateArgs: [
  "exec",
  "visual-delta",
  "update",
  "--allow-dirty",
  "--approved",
];

visualInteractionUpdateArgs: [
  "exec",
  "visual-delta",
  "interaction-update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
];
```

Override these to point at host scripts when needed (see Advanced host below).
The middleware appends `--create-only`, `--component` / `--story-id`,
`--step-label`, `--step-id`, and sets `VISUAL_UPDATE_APPROVED=1` in the child
environment.

## Story CSF

```ts
parameters: {
  visualDelta: {
    images: [
      {
        src: "/visual-baselines/shadcn/button/default-chromium-darwin.png",
        align: "canvas", // pin to story subject; or "viewport"
        placement: "center",
      },
    ],
    /** Chromatic-style modes (globals + optional per-mode baseline `src`). */
    modes: {
      dark: {
        globals: { colorMode: "dark" },
        src: "/visual-baselines/…/default--dark-chromium-darwin.png",
      },
    },
    /** pixelmatch color threshold 0–1 (Live Diff). */
    diffThreshold: 0.2,
    diffIncludeAntiAliasing: false,
    /** Extra settle ms before capture (Live Diff + Playwright). */
    delay: 0,
    /** Hide these CSS regions during capture (plus data-visual-delta-ignore). */
    ignoreSelectors: [".toast"],
    cropToViewport: false,
    passThresholdPercent: 0.1,
    interactions: [
      {
        stepId: "opens-chooser",
        label: "Opens chooser",
        src: "/visual-baselines/…/default--opens-chooser-chromium-darwin.png",
      },
    ],
  },
},
```

Ignore markers in the DOM (highlighted via toolbar **Highlight ignored**):
`data-visual-delta-ignore`, `data-chromatic="ignore"`, `.chromatic-ignore`.

Panel **More → Configuration** shows resolved host options
(`GET /__visual-delta/config`), including `playwrightPassThresholdPercent`
(from `.visual-delta/playwright.json`, default 1%). Diff Chromium Thresh can
push that host file via **Update Playwright config**.

Testing Module **Run tests** (global runner and sidebar story/component
context menu) runs the checked actions: compare (on by default),
create/update baselines (**Create missing** mode default; baselines row off
by default), and/or **Update status** (off by default; pass → `visual-ready`,
fail → `visual-failed`). Context menu scope is the selected entry; the global
runner uses sidebar leaf stories.

Chromatic gap matrix: [`PARITY.md`](./PARITY.md).

### Review tags (Accept vs Ready / Failed)

Review tags are mutually exclusive CSF tags on the story (sidebar + toolbar
badges). Set them from the panel or by editing `tags={…}` / posting
`POST /__visual-delta/review-status` (single `{ storyId, status }` or batched
`{ updates: [{ storyId, status }] }`). Patchers keep **exactly one** review tag:
setting `ready` clears `failed` / `pending` / `approved` even when the desired
tag was already present alongside a sibling. Skipping visual clears all review
tags. **Update status** / middleware refuse `visual-failed` when no committed
baseline PNG exists for the story (missing-baseline Playwright failures are
skipped, not stamped failed).

| Tag               | Meaning                                                | How it is set                                     |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `visual-pending`  | Baseline exists; awaiting review                       | Create / rewrite baselines; **Unaccept**          |
| `visual-ready`    | Agent/dev finished visual work; ready for human review | Panel **Ready** pad, or `tags={["visual-ready"]}` |
| `visual-approved` | Human accepted the baseline                            | **Accept** (story or component scope)             |
| `visual-failed`   | Review rejected / known bad                            | Panel **Failed** pad                              |

**Panel controls**

- **Accept / Unaccept** — human sign-off. Accept → `visual-approved`; Unaccept →
  `visual-pending`. Scope menu: story vs entire component.
- **Ready / Failed** pad — agent/dev signals only (pending/approved are _not_
  on this pad; use Accept/Unaccept for those).

**Agent guidance:** after updating pixels or stabilizing a story, mark
`visual-ready` so humans can scan the sidebar for `⚑ Ready`. Do **not** set
`visual-approved` from agent work — leave Accept to a human. Rewrite / Update
baselines always resets matching stories to `visual-pending` (clears approved
and ready).

### `skip-visual` from the panel

The Visual Delta panel **More** menu can add or remove `skip-visual` on the
current story (patches the `.stories.svelte` CSF open tag via
`POST /__visual-delta/skip-visual`):

| Menu action                 | Effect                                      |
| --------------------------- | ------------------------------------------- |
| **Skip visual tests**       | Adds `skip-visual` (and clears review tags) |
| **Include in visual tests** | Removes `skip-visual`                       |

Skipped stories are excluded from Playwright visual runs and from Visual Delta
Testing Module scope. Review status and Update baselines stay disabled while
skipped. Prefer this over hand-editing tags when flake cannot be stabilized
(document why in the story if the skip is permanent).

### Review layout (canvas + panel)

Toggle **Review layout** from the preview toolbar, the panel header control, or
the panel **More** menu to:

1. Hide the sidebar
2. Dock the addon panel **bottom**, full width
3. Select the Visual Delta panel
4. Size the bottom panel to ~42% of the viewport height

The preview toolbar stays visible so the toolbar control remains a reliable
exit affordance (hiding it remounts Storybook landmark regions and can crash
the manager). Exit restores the prior sidebar, panel position, and sizes;
Visual Delta stays selected.

### Diff capture engines

Diff is its own split button (separate from Story / Component / All runs):

| Mode              | Capture                                                   | Use when                                 |
| ----------------- | --------------------------------------------------------- | ---------------------------------------- |
| **Diff HTML**     | `html-to-image` in the live preview iframe                | Fast iteration                           |
| **Diff Chromium** | Playwright Chromium via `/__visual-delta/capture-subject` | Matching committed baselines (fonts, AA) |

**Diff Chromium** streams NDJSON progress (`launching` → `navigating` →
`settling` → `capturing` → `encoding`) into the Diff Stop control. Stop aborts
the fetch mid-capture.

`html-to-image` rasterizes through SVG `foreignObject`, so variable fonts
(e.g. DM Sans Variable) can paint at different glyph widths than Playwright’s
native screenshots. Prefer **Diff Chromium** when diagnosing baseline parity.
Requires `playwright` installed in the host (optional peer of this package).

Storybook’s built-in fullscreen (F) control is unchanged (canvas-only).

## Addon vs host

| This package                                      | Your project                                     |
| ------------------------------------------------- | ------------------------------------------------ |
| Panel, Testing Module, overlay, Live Diff         | Committed PNGs under the snapshot dir            |
| Preset `staticDirs` → `/visual-baselines`         | Thin Playwright entry (`defineVisualSuite`)      |
| `viteFinal` middleware + CSF inject               | Optional tag-badge manager chrome                |
| Packaged `visual-delta` CLI (create / update / …) | Custom suites (reference captures, extra masks)  |
| `storybook-addon-visual-delta/playwright` helpers | Approval policy is `--approved` / env (built-in) |

---

## Advanced host: `@stevejuma/ui` catalog

The UI catalog uses the packaged Playwright config helper and preset
`staticDirs`, but keeps catalog-specific overrides:

- `baselinePathMode: "nested-import"`
- create/update via `scripts/ui-generator/cli.ts` (Tasks/Fava gates, recipes)
- custom `tests/visual/storybook.spec.ts` (not `defineVisualSuite`)

```ts
// playwright.config.ts
import { defineVisualPlaywrightConfig } from "storybook-addon-visual-delta/playwright";
export default defineVisualPlaywrightConfig({ port: 6007 });
```

### `package.json` scripts

```json
{
  "scripts": {
    "storybook": "storybook dev -p 9009",
    "build-storybook": "storybook build",
    "test:visual": "playwright test",
    "test:visual:update": "tsx scripts/ui-generator/cli.ts visual-update",
    "visual-delta": "node packages/storybook-addon-visual-delta/dist/node/cli.js"
  }
}
```

### CLI entrypoints

| Command                                                     | Role                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tsx scripts/ui-generator/cli.ts visual-update`             | Create missing or overwrite primary baselines; patches CSF `parameters.visualDelta` |
| `tsx scripts/ui-generator/cli.ts visual-interaction-update` | Mid-play step PNG + CSF `interactions` entry                                        |
| `pnpm ui visual:tag …`                                      | Bulk `skip-visual` / mutually exclusive review tags (component, story, or prefix)   |
| `pnpm test:visual` / `pnpm exec playwright test`            | Compare only (`PLAYWRIGHT_UPDATE_SNAPSHOTS=0` from middleware)                      |

Useful flags on those CLIs: `--approved`, `--allow-dirty`, `--create-only`,
`--skip-build`, `--rebuild`, `--component <name>`, `--story-id <id>`,
`--step-label`, `--step-id`. For `visual:tag`: `--status`, `--prefix`.

`visual:tag` examples (requires `storybook-static/index.json` for expansion):

```bash
pnpm ui visual:tag review --status ready --component button
pnpm ui visual:tag skip --story-id shadcn-button--default
pnpm ui visual:tag include --prefix shadcn-button--
pnpm ui visual:tag --help
```

Host catalog policy: Apps/Beancount and Tasks stories are typically
`skip-visual` (reference captures stay outside the Playwright suite). Prefer
the panel for one-off edits; use `visual:tag` for bulk/scripted updates.

### `.storybook/main.ts`

```ts
addons: [
  {
    name: "./visual-delta-preset.ts", // or package name when published
    options: {
      visualDelta: {
        baselinePathMode: "nested-import",
        visualServerPort: 6007,
        visualTestArgs: ["exec", "playwright", "test"],
        visualUpdateArgs: [
          "exec",
          "tsx",
          "scripts/ui-generator/cli.ts",
          "visual-update",
          "--allow-dirty",
          "--approved",
          "--skip-build",
        ],
        visualInteractionUpdateArgs: [
          "exec",
          "tsx",
          "scripts/ui-generator/cli.ts",
          "visual-interaction-update",
          "--allow-dirty",
          "--approved",
          "--skip-build",
        ],
      },
    },
  },
],
// `/visual-baselines` is mounted by the addon preset `staticDirs`.
```

### Developing the addon from source (optional)

When editing this package’s `src/` next to Storybook, Storybook’s manager
builder may not pick up `node_modules` changes. A small local preset that
points `manager` / `preview` at absolute `src/` files (and re-exports
`staticDirs` / `viteFinal` from the package) avoids that:

```ts
// .storybook/visual-delta-preset.ts
import { fileURLToPath } from "node:url";

const addonSrc = (entry: string) =>
  fileURLToPath(
    import.meta.resolve(
      `../packages/storybook-addon-visual-delta/src/${entry}`,
    ),
  );

export function previewAnnotations(entry: string[] = []) {
  return [...entry, addonSrc("preview.ts")];
}

export function managerEntries(entry: string[] = []) {
  return [...entry, addonSrc("manager.tsx")];
}

export {
  viteFinal,
  webpack,
} from "../packages/storybook-addon-visual-delta/src/preset.js";
```

```ts
addons: [import.meta.resolve("./visual-delta-preset.ts")],
```

Published / installed consumers can use the package name instead.

## Further reading

- [`VENDOR.md`](./VENDOR.md) — behavior details, catalog fixtures, upstream notes
- Package Vitest project: `pnpm exec vitest run --project visual-delta`
