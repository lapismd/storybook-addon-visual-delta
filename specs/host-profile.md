# UI catalog Visual Delta host profile

This reference defines how the `/Users/stevejuma/ui` catalog hosts the portable Visual Delta package. It covers local package registration, writers, paths, ports, scripts, ownership, and repository-specific safety policy.

## Normative requirements

These requirements bind the portable package to this repository without merging their responsibilities.

| ID          | Requirement                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VD-HOST-001 | The catalog MUST load the local source preset for development and MUST register manager and preview entries exactly once. Packaged consumers MUST rely on package exports without duplicate entry registration.                            |
| VD-HOST-002 | The catalog MUST use `nested-import` baseline paths and the committed snapshot root `tests/visual/storybook.spec.ts-snapshots`. Host writers and package readers MUST resolve identical paths.                                             |
| VD-HOST-003 | Catalog baseline writes MUST use the `scripts/ui-generator` writers because they own Svelte CSF patches and repository layout. Compare runs MUST use the package CLI and Playwright without snapshot updates.                              |
| VD-HOST-004 | One `STORYBOOK_PORT` MUST derive every secondary lane. A checkout MUST NOT stop or reuse another checkout’s listener.                                                                                                                      |
| VD-HOST-005 | Full checks MUST retain complete visual comparison as the safety gate. Affected comparison is an optimization and MUST NOT replace the complete suite in `pnpm checks`.                                                                    |
| VD-HOST-006 | Portable behavior belongs in the package. Repository layout, Svelte source writers, generator approval gates, catalog fixtures, and port supervision belong to the host. Duplicate contract logic MUST converge on shared package helpers. |

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

Host writers patch Svelte Component Story Format (CSF), preserve catalog review tags, and apply generator approval policy. The package owns canonical identity and path helpers.

The host and package currently contain overlapping path and capture helpers. New behavior MUST be added to the package contract first, then consumed by host adapters. Parallel algorithms that can map one story to different files are non-conforming.

## Port lanes

The repository derives lanes from `STORYBOOK_PORT`:

| Surface                          | Port            |
| -------------------------------- | --------------- |
| Main Storybook                   | Base            |
| Visual static server             | Base plus `1`   |
| Visual Delta panel static        | Base plus `3`   |
| Visual Delta panel Storybook     | Base plus `4`   |
| Visual Delta panel visual server | Base plus `5`   |
| Spare debug and cleanup          | Base plus `90`  |
| Workspace pointer Storybook      | Base plus `200` |
| Workspace pointer visual server  | Base plus `201` |

The default checkout uses base port `9009`. Another Jujutsu workspace uses ignored `.env.storybook.local` with an unused base. Explicit shell environment values take precedence over the ignored file.

`pnpm storybook:stop` operates only on the lane selected by the current checkout. Tests MUST use an unused explicit base rather than reclaiming an active listener.

## Repository scripts

The authoritative host entry points are:

| Command                        | Contract                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm storybook`               | Start Storybook and its supervised local lane                  |
| `pnpm storybook:ui`            | Start the UI catalog without inventing a different launch path |
| `pnpm storybook:stop`          | Stop only this checkout’s lane                                 |
| `pnpm build-storybook`         | Produce static Storybook plus `preview-stats.json`             |
| `pnpm test:visual`             | Complete compare-only visual suite                             |
| `pnpm test:visual:affected`    | Conservative affected compare-only suite                       |
| `pnpm test:visual-delta-panel` | Browser acceptance for manager, panel, and preview integration |
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

The host owns:

- Catalog story layout and review governance
- Svelte source patching through `scripts/ui-generator`
- Snapshot directory policy
- Port supervision and checkout isolation
- Repository command composition
- Catalog-specific fixtures and aggregate gates

Related contracts: [Architecture](./architecture.md), [Configuration](./configuration.md), [Baseline model](./baseline-model.md), and [Verification](./verification.md).
