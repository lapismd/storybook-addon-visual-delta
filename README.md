# storybook-addon-visual-delta

Storybook addon for comparing stories to committed baseline PNGs: placement pad,
overlay / heatmap Live Diff, Create / Update baselines, Run visual tests, and
review tags.

See [`VENDOR.md`](./VENDOR.md) for implementation history and behavior notes.
Storybook loads TypeScript/`tsx` from `src/` (no committed `dist/`).

## Requirements

| Peer        | Notes                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `storybook` | Manager + preview annotations                                            |
| `react`     | Manager / panel UI                                                       |
| `vite`      | Needed for `viteFinal` (middleware + CSF inject) on Vite Storybook hosts |

You supply:

1. **Baseline PNGs** on disk, served at `/visual-baselines`
2. **CLI commands** the middleware can spawn for create / update / interaction writes
3. **Playwright** (or equivalent) for compare-only runs via `pnpm exec playwright test`

## Desired project layout

With the package defaults, organize the host like this:

```text
<project-root>/
  .storybook/
    main.ts                 # addon + staticDirs
  tests/
    visual/
      storybook.spec.ts     # Playwright visual suite
      storybook.spec.ts-snapshots/   # committed baseline PNGs
        <family>/
          <story-slug>-chromium-darwin.png
  scripts/                  # (or any path you wire in options)
    … CLI entry that accepts the flags below
  package.json              # pnpm scripts: build-storybook, playwright, …
```

| Concern                         | Default path / command                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| Snapshot directory              | `tests/visual/storybook.spec.ts-snapshots`                             |
| Public URL prefix               | `/visual-baselines` (via `staticDirs`)                                 |
| Primary baseline write          | `pnpm` + `visualUpdateArgs` (see defaults)                             |
| Interaction baseline write      | `pnpm` + `visualInteractionUpdateArgs`                                 |
| Compare-only run                | `pnpm` + `visualTestArgs`                                              |
| Static Storybook for Playwright | `storybook-static/` via `pnpm build-storybook` when rebuild is allowed |

Match `staticDirs.from` to `snapshotDir`. Baseline URLs in CSF look like:

`/visual-baselines/<dir>/<slug>-chromium-darwin.png`

## Install

```bash
pnpm add -D storybook-addon-visual-delta
```

Peers: `storybook`, `react`, and `vite` for Vite-based Storybook.

### Package exports

| Import                                        | Purpose                                    |
| --------------------------------------------- | ------------------------------------------ |
| `storybook-addon-visual-delta`                | Package root                               |
| `storybook-addon-visual-delta/preset`         | `viteFinal` / webpack hooks                |
| `storybook-addon-visual-delta/preview`        | Overlay + `runStep` / park                 |
| `storybook-addon-visual-delta/manager`        | Panel + Testing Module + review-layout tool |
| `storybook-addon-visual-delta/node`           | Middleware, inject plugins, options (Node) |
| `storybook-addon-visual-delta/visual-capture` | Mid-play capture helper                    |

## Storybook configuration

### Register the addon

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/your-framework";

const config: StorybookConfig = {
  addons: [
    {
      name: "storybook-addon-visual-delta",
      options: {
        visualDelta: {
          // optional — see Options; omit to use the defaults above
        },
      },
    },
  ],
  staticDirs: [
    {
      from: "../tests/visual/storybook.spec.ts-snapshots",
      to: "/visual-baselines",
    },
  ],
};

export default config;
```

Bare registration (defaults only):

```ts
addons: ["storybook-addon-visual-delta"],
```

`staticDirs` is **required**. The addon does not mount baseline files itself.

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

| Method | Path                                          | Action                                      |
| ------ | --------------------------------------------- | ------------------------------------------- |
| `POST` | `/__visual-delta/create-baseline`             | Create missing baselines + CSF wiring       |
| `POST` | `/__visual-delta/update-baseline`             | Overwrite baselines                         |
| `POST` | `/__visual-delta/create-interaction-baseline` | Mid-play step capture                       |
| `POST` | `/__visual-delta/run-tests`                   | Compare-only Playwright run (NDJSON stream) |
| `POST` | `/__visual-delta/cancel-tests`                | Abort an in-flight run                      |
| `POST` | `/__visual-delta/review-status`               | Set CSF review tags                         |
| `POST` | `/__visual-delta/skip-visual`                 | Add or remove `skip-visual` on a story      |

Create / update spawn `pnpm <visualUpdateArgs…>` with appended flags:

- `--create-only` on create
- `--component <name>` or `--story-id <id>`

Interaction writes spawn `pnpm <visualInteractionUpdateArgs…>` with:

- `--create-only` unless overwrite
- `--story-id`, `--step-label`, and optional `--step-id`

Run-tests uses `pnpm <visualTestArgs…>` (optional `-g` grep from story ids)
and may call `pnpm build-storybook` first when `allowRebuild` is enabled and
`storybook-static/index.json` is missing (or the client requests a rebuild).

## Options (`VisualDeltaHostOptions`)

Pass under addon `options.visualDelta`. Types from
`storybook-addon-visual-delta/preset` or `…/node`.

| Option                        | Default                                    | Purpose                                                       |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `root`                        | Vite `config.root` / `process.cwd()`       | Spawn cwd and path resolution                                 |
| `snapshotDir`                 | `tests/visual/storybook.spec.ts-snapshots` | Absolute or root-relative PNG directory                       |
| `baselinePathMode`            | `nested-import`                            | Use nested import-path baselines or flat `story-id` baselines |
| `addonSrcDir`                 | Addon `src/`                               | Vite watch root for addon preview HMR                         |
| `visualUpdateArgs`            | See table below                            | Argv after `pnpm` for primary baseline writes                 |
| `visualInteractionUpdateArgs` | See table below                            | Argv after `pnpm` for mid-play captures                       |
| `visualTestArgs`              | `exec playwright test`                     | Argv after `pnpm` for compare-only runs                       |
| `visualServerPort`            | `6007`                                     | Static Storybook port owned by the visual Playwright config   |
| `allowRebuild`                | `true` (unless set `false`)                | Allow `build-storybook` before run-tests                      |

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

These are the built-in defaults — implement matching entrypoints (or override
the options to point at your own scripts):

```ts
visualUpdateArgs: [
  "exec",
  "tsx",
  "scripts/ui-generator/cli.ts",
  "visual-update",
  "--allow-dirty",
  "--approved",
];

visualInteractionUpdateArgs: [
  "exec",
  "tsx",
  "scripts/ui-generator/cli.ts",
  "visual-interaction-update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
];
```

Your CLI should honor the flags the middleware appends (`--create-only`,
`--component` / `--story-id`, `--step-label`, `--step-id`). Create/update also
sets `VISUAL_UPDATE_APPROVED=1` in the child environment.

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

Review / Testing Module tags: `skip-visual`, `visual-pending`, `visual-approved`,
`visual-failed`.

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

Review tags (when baselines are configured): `visual-pending`,
`visual-approved`, `visual-failed` via `/__visual-delta/review-status`.

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

Storybook’s built-in fullscreen (F) control is unchanged (canvas-only).

## Addon vs host

| This package                              | Your project                                       |
| ----------------------------------------- | -------------------------------------------------- |
| Panel, Testing Module, overlay, Live Diff | Playwright suite + committed PNGs                  |
| `viteFinal` middleware + CSF inject       | `staticDirs` → `/visual-baselines`                 |
| Preview `runStep` / park                  | Baseline write CLI (create / update / interaction) |
| `fetch` clients + path constants          | Approval / gating policy in those CLIs             |

---

## Example: configuring with `@stevejuma/ui` scripts

The following is how a full host wires the addon to existing Playwright and
generator CLIs (paths relative to that project root). Use it as a template;
point `visualUpdateArgs` / `visualInteractionUpdateArgs` at whatever implements
the same flags in your tree.

### `package.json` scripts

```json
{
  "scripts": {
    "storybook": "storybook dev -p 9009",
    "build-storybook": "storybook build",
    "test:visual": "playwright test",
    "test:visual:update": "tsx scripts/ui-generator/cli.ts visual-update"
  }
}
```

### CLI entrypoints

| Command                                                     | Role                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tsx scripts/ui-generator/cli.ts visual-update`             | Create missing or overwrite primary baselines; patches CSF `parameters.visualDelta` |
| `tsx scripts/ui-generator/cli.ts visual-interaction-update` | Mid-play step PNG + CSF `interactions` entry                                        |
| `pnpm test:visual` / `pnpm exec playwright test`            | Compare only (`PLAYWRIGHT_UPDATE_SNAPSHOTS=0` from middleware)                      |

Useful flags on those CLIs: `--approved`, `--allow-dirty`, `--create-only`,
`--skip-build`, `--component <name>`, `--story-id <id>`, `--step-label`,
`--step-id`.

### `.storybook/main.ts`

```ts
import type { StorybookConfig } from "@storybook/svelte-vite";

const config: StorybookConfig = {
  addons: [
    {
      name: "storybook-addon-visual-delta",
      options: {
        visualDelta: {
          snapshotDir: "tests/visual/storybook.spec.ts-snapshots",
          visualUpdateArgs: [
            "exec",
            "tsx",
            "scripts/ui-generator/cli.ts",
            "visual-update",
            "--allow-dirty",
            "--approved",
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
          allowRebuild: true,
        },
      },
    },
  ],
  staticDirs: [
    {
      from: "../tests/visual/storybook.spec.ts-snapshots",
      to: "/visual-baselines",
    },
  ],
};

export default config;
```

Omitting `visualDelta` options is equivalent when those same default paths and
CLI argv already exist in the project.

### Developing the addon from source (optional)

When editing this package’s `src/` next to Storybook, Storybook’s manager
builder may not pick up `node_modules` changes. A small local preset that
points `manager` / `preview` / `viteFinal` at absolute `src/` files avoids that:

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
