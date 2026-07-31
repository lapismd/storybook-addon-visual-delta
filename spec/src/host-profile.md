# UI catalog Visual Delta host profile

This reference defines how the `/Users/stevejuma/ui` catalog hosts the portable Visual Delta package. It covers local package registration, writers, paths, ports, scripts, ownership, and repository-specific safety policy.

## Normative requirements

These requirements bind the portable package to this repository without merging their responsibilities.

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-HOST-001 | The catalog MUST load the local source preset for development and MUST register manager and preview entries exactly once. Packaged consumers MUST rely on package exports without duplicate entry registration.                                                                                                                                                      |
| VD-HOST-002 | The catalog MUST use `nested-import` baseline paths and the committed snapshot root `tests/visual/storybook.spec.ts-snapshots`. Host writers and package readers MUST resolve identical paths.                                                                                                                                                                       |
| VD-HOST-003 | Catalog baseline writes MUST use the `scripts/ui-generator` writers because they own Svelte CSF patches and repository layout. Those adapters MUST consume package-owned static freshness, target resolution, and capture identity contracts for primary and interaction writes. Compare runs MUST use the package CLI and Playwright without snapshot updates.      |
| VD-HOST-004 | One `STORYBOOK_PORT` MUST derive every secondary lane. At most one supervisor and one Storybook child MAY own a checkout-and-port lane. Duplicate start MUST reuse that owner; restart and stop MUST replace or terminate only the matching owner and descendants. A checkout MUST NOT stop or reuse another checkout’s listener.                                    |
| VD-HOST-005 | Full checks MUST retain complete visual comparison as the safety gate. Affected comparison is an optimization and MUST NOT replace the complete suite in `pnpm checks`.                                                                                                                                                                                              |
| VD-HOST-006 | Portable behavior belongs in the package, including the package-owned self-test Storybook (`packages/storybook-addon-visual-delta/.storybook`) and Visual Delta panel/manager acceptance fixtures. Repository layout, Svelte source writers, generator approval gates, **product** catalog stories, and UI catalog port supervision belong to the host. Duplicate contract logic MUST converge on shared package helpers. |
| VD-HOST-007 | Regular fullscreen catalog stories MUST retain the established `1.5rem` `#storybook-root` inset. Only explicitly classified Workspace and Shell application surfaces MAY use the full capture viewport. Capture and overlay code MUST measure the active layout instead of assuming either frame, and changing this host layout requires deliberate baseline review. |

## Local package registration

`.storybook/main.ts` resolves a local preset so Vite loads package source without a committed manager or preview build. The local preset must append the package manager and preview entries because file-path addon registration does not automatically resolve package export entries.

Packaged registration through `storybook-addon-visual-delta` already resolves `manager` and `preview`. The packaged preset MUST NOT append them again.

The host aliases the package name to the local package root and excludes it from dependency optimization. `addonSrcDir` or equivalent local watching MAY trigger preview reloads, but it MUST avoid restart loops with the Storybook supervisor.

## Snapshot layout and writers

The catalog uses:

| Concern                     | Host value                                              |
| --------------------------- | ------------------------------------------------------- |
| Snapshot root               | `tests/visual/storybook.spec.ts-snapshots`              |
| Path mode                   | `nested-import`                                         |
| Public mount                | `/visual-baselines`                                     |
| Project and platform suffix | `-chromium-darwin.png`                                  |
| Primary writer              | `scripts/ui-generator/cli.ts visual-update`             |
| Interaction writer          | `scripts/ui-generator/cli.ts visual-interaction-update` |
| Compare command             | Playwright through `visual-delta test`                  |

Host writers patch Svelte Component Story Format (CSF), preserve catalog review tags, apply generator approval policy, and delegate static-build freshness and capture-target semantics to package helpers. The package owns canonical identity, path, freshness, and capture-target helpers.

The host and package currently contain overlapping path and capture helpers. New behavior MUST be added to the package contract first, then consumed by host adapters. Parallel algorithms that can map one story to different files, reuse different static inputs, or capture different painted bounds are non-conforming.

## Port lanes

The repository derives lanes from `STORYBOOK_PORT`:

| Surface                          | Port            |
| -------------------------------- | --------------- |
| Main Storybook                   | Base            |
| Visual static server             | Base plus `1`   |
| Visual Delta panel static        | Base plus `3` (package `storybook-static`) |
| Visual Delta panel Storybook     | Base plus `4` (package React Storybook; override with `VISUAL_DELTA_STORYBOOK_PORT`) |
| Visual Delta panel visual server | Base plus `5`   |
| Spare debug and cleanup          | Base plus `90`  |
| Workspace pointer Storybook      | Base plus `200` |
| Workspace pointer visual server  | Base plus `201` |

The default checkout uses base port `9009`. Another Jujutsu workspace uses ignored `.env.storybook.local` with an unused base. Explicit shell environment values take precedence over the ignored file.

`pnpm storybook:stop` operates only on the lane selected by the current checkout. Tests MUST use an unused explicit base rather than reclaiming an active listener.

Supervisor ownership is keyed by checkout root and base port in ignored cache state. An ordinary duplicate start reports and reuses the live owner. Explicit restart replaces that owner, while stop terminates its descendants before the supervisor and releases ownership. Preview-only source changes use Vite HMR; manager, shared, and Node changes produce one debounced supervised restart.

## Catalog preview layout

The shared Storybook preview uses fullscreen layout with a `1.5rem` root inset for ordinary component stories. `src/storybook/catalog-layout.ts` marks Workspace and Shell application surfaces with `data-ui-catalog-full-viewport`; `src/storybook.css` removes the inset only for that explicit classification.

This distinction is part of the host capture contract: ordinary component captures retain the established inset, while application surfaces remain edge-to-edge. Visual Delta still measures body, root, subject, and viewport geometry for every story and MUST NOT encode either layout as a portable fixed-padding assumption.

## Repository scripts

The authoritative host entry points are:

| Command                        | Contract                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm storybook`               | Start the UI catalog and its supervised local lane             |
| `pnpm storybook:ui`            | Start the UI catalog without inventing a different launch path |
| `pnpm visual-delta:storybook`  | Start the package-owned Visual Delta self-test Storybook       |
| `pnpm storybook:stop`          | Stop only this checkout’s UI catalog lane                      |
| `pnpm build-storybook`         | Produce UI static Storybook plus `preview-stats.json`          |
| `pnpm test:visual`             | Complete compare-only visual suite                             |
| `pnpm test:visual:affected`    | Conservative affected compare-only suite                       |
| `pnpm test:visual-delta-panel` | Package Storybook panel self-test (`panel.spec.ts`; not UI)    |
| `pnpm test:visual-delta-manager` | Package Storybook manager/overlay suite (stub fidelity WIP)  |
| `pnpm storybook:check`         | Storybook tests, build, panel acceptance, and visual compare   |
| `pnpm checks`                  | Repository aggregate gate including complete visual compare    |

`pnpm test:visual:update` is a writer and requires explicit approval and an exact component or story target. It is not part of compare-only verification.

## Host safety policy

The package default for `allowVcsWrites` is false, and project workflow defaults are off. The catalog MAY enable the host capability only through an explicit repository decision, while project configuration remains a separate opt-in.

Working-copy experimentation with automatic approval or commits is implementation evidence only. It does not change this specification until the host policy requirement and verification map change.

The repository never updates committed visual baselines during ordinary checks. Any browser acceptance run selected for specification verification MUST remain compare-only.

## Ownership boundaries

The package owns:

- Public types and exports
- Middleware protocols
- Preview and manager behavior
- Canonical baseline identity
- Portable Playwright suite and configuration
- Affected planner and run hub
- Sidecar schema and result classifier
- VCS adapters and guarded change sets
- Self-test Storybook catalog (`src/stories/**/*.stories.tsx`) and panel/manager acceptance fixtures

The host owns:

- Product catalog story layout and review governance
- Svelte source patching through `scripts/ui-generator`
- Product snapshot directory policy (`tests/visual/storybook.spec.ts-snapshots`)
- UI catalog port supervision and checkout isolation
- Repository command composition
- Aggregate gates for the product visual suite

Related contracts: [Architecture](./architecture.md), [Configuration](./configuration.md), [Baseline model](./baseline-model.md), and [Verification](./verification.md).
