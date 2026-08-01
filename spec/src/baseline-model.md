# Visual Delta baseline model

This reference defines which stories have visual coverage, how every baseline variant is identified, where artifacts live, how Storybook receives baseline metadata, and when comparison evidence is fresh.

## Normative requirements

These requirements give every comparison target one safe and durable identity.

| ID          | Requirement                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VD-BASE-001 | Every eligible story MUST have one primary comparison target. Configured mode and wired interaction baselines MUST add independent targets without replacing the primary target.                                                                                               |
| VD-BASE-002 | One canonical path resolver MUST determine baseline paths for writers, Playwright, Vite injection, static serving, panel hydration, history, sidecars, and deletion.                                                                                                           |
| VD-BASE-003 | `story-id` and `nested-import` path modes MUST be deterministic, traversal-safe, and collision-resistant. Missing identity data or an unresolved collision MUST fail rather than select another story’s file.                                                                  |
| VD-BASE-004 | Story wiring MUST use `parameters.visualDelta.images`, `modes`, and `interactions`. Middleware MAY inject missing primary wiring only when the matching PNG exists. Optimistic post-write hydration MUST attach only the successfully written target to its originating story. |
| VD-BASE-005 | Sidecars MUST separate runner status from comparison outcome and MUST identify the baseline and capture configuration used. Stale sidecars MUST NOT establish current result state.                                                                                            |
| VD-BASE-006 | `/visual-baselines` MUST expose only files under the configured snapshot directory. Baseline and sidecar URLs MUST remain relative to that mount.                                                                                                                              |
| VD-BASE-007 | Every primary, mode, and interaction target MUST have an independent `{ browser, platform }` identity. Resolution MUST use the exact selected environment and MUST NOT fall back to another browser or platform. Canonical baseline artifacts MUST encode that identity in their filename; an explicitly wired non-canonical demo asset MAY instead declare the same exact environment as story metadata, and an unqualified source without that metadata MUST NOT match any environment. Existing Chromium/Darwin filenames remain valid without migration. |
| VD-BASE-008 | Project OS parity for a story's primary baseline MUST require every configured browser combined with every platform observed anywhere beneath the configured `snapshotDir`, plus the runtime platform. Observed environments for disabled browsers MUST remain discoverable and filterable but MUST NOT add that browser to the required matrix. Missing or unresolved primary paths MUST remain distinct coverage values. Modes and interactions MUST NOT affect a story's primary parity result. |

## Story eligibility and coverage

A Storybook index entry is eligible when it represents a story and does not contain the `skip-visual` tag. Review tags do not change eligibility.

Coverage has three independent dimensions:

- The primary baseline exists
- Every enabled named mode with a `src` exists
- Every wired interaction entry has an existing `src`

Missing coverage reports `missing-baseline` for the missing target. It does not classify an existing target as mismatched and does not infer review status.

The project-wide parity platform set is the union of the runtime platform and
platforms parsed from canonical baseline PNG filenames beneath `snapshotDir`.
The required matrix combines that set with configured browsers only. Per-story
environment coverage checks the primary path for the union of required and
observed exact environments; additional environments require file-existence
checks only and do not replace the runtime aggregate or its result hashes.

## Canonical baseline identity

A baseline identity contains:

| Field       | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `storyId`   | Stable Storybook story ID                                            |
| `variant`   | Primary, named mode, or interaction                                  |
| `variantId` | Mode slug or interaction `id`, absent for primary                    |
| `pathMode`  | `story-id` or `nested-import`                                        |
| `browser`   | Playwright browser project: `chromium`, `firefox`, or `webkit`        |
| `platform`  | Node platform that produced the baseline, such as `darwin`, `linux`, or `win32` |

The resolver MUST normalize path separators to `/` for public URLs. It MUST reject `..`, absolute paths outside the snapshot root, missing story-ID separators, and malformed variant IDs.

## Path modes and filenames

`story-id` stores a flat path:

```text
{story-id}{variant-infix}-{browser}-{platform}.png
```

`nested-import` derives a directory from the normalized story import path and a filename from the story slug:

```text
{import-derived-directory}/{story-slug}{variant-infix}-{browser}-{platform}.png
```

The variant infix is:

- Empty for the primary baseline
- `--{mode-slug}` for a named mode
- `--{interaction-id}` for an interaction

When several story files share one directory and could produce the same story slug, `nested-import` MUST include a deterministic story-file segment or reject the collision. It MUST preserve established non-colliding paths.

## Story wiring

The canonical interaction shape is:

```ts
type VisualDeltaInteraction = {
  id: string;
  label: string;
  src: string;
};
```

`id` is the stable filename and replay identifier. `label` is human-facing text. `src` is the `/visual-baselines` URL.

An image entry MAY include the capture viewport, device scale factor, alignment,
placement, mode, offsets, anchor, and an explicit baseline environment. A story
parameter MAY declare one environment inherited by its explicitly wired primary,
mode, and interaction demo assets. Explicit environment metadata exists for
non-canonical teaching fixtures whose URLs do not use baseline filenames; it
MUST NOT override a browser/platform suffix on a canonical baseline artifact or
authorize cross-environment fallback. A mode definition MAY contain globals
without a baseline `src`; such a mode is selectable but does not create coverage
until a baseline is wired.

The Vite injector MUST preserve explicit `parameters.visualDelta`. It MAY inject primary metadata only for a matching file on disk and MUST ignore `skip-visual` stories.

Post-write hydration uses the completed write scope, not whichever story is active when the response arrives. Navigation during a write MUST NOT synthesize or display a baseline URL for the destination story.

## Static mount

The preset maps the configured snapshot directory to `/visual-baselines`. A host MAY provide an equivalent mapping, and the preset MUST avoid a conflicting duplicate mount.

Static serving is read-only. Development mutations operate on verified filesystem paths under the snapshot root and never derive a writable path from an unchecked public URL.

## Sidecars and diagnostic artifacts

Each comparison target MAY have:

| Artifact        | Purpose                                   | Durability                |
| --------------- | ----------------------------------------- | ------------------------- |
| Baseline `.png` | Expected image                            | Committed source of truth |
| `.json`         | Structured runner and comparison evidence | Local, derived            |
| `.actual.png`   | Captured image used for diagnosis         | Local, derived            |
| `.diff.png`     | Changed-pixel visualization               | Local, derived            |

Version 2 sidecars MUST keep `runnerStatus` and `outcome` independent. Valid outcomes are `passed`, `changed-within-tolerance`, `mismatch`, `missing-baseline`, `error`, and `skipped`.

When available, a sidecar records `operationId`, browser, platform, baseline SHA-256, capture-configuration SHA-256, dimensions, viewport, device scale factor, thresholds, changed-pixel counts, bounds, histogram, policy status, and diagnostic artifact paths.

## Freshness

A result is fresh only when:

- Its baseline hash matches the current baseline PNG
- Its capture-configuration hash matches current effective capture settings
- Its story and variant identity match the selected target
- Its operation completed with a terminal runner status

Changing a baseline, capture setting, interaction target, named mode, or eligibility MUST invalidate affected sidecars. Invalidating evidence MUST NOT delete the committed baseline or change review status unless the mutation contract explicitly requires pending review.

Related contracts: [Configuration](./configuration.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [Verification](./verification.md).
