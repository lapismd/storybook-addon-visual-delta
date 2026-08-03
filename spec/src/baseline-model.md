# Visual Delta baseline model

This reference defines which stories have visual coverage, how every baseline variant is identified, where artifacts live, how Storybook receives baseline metadata, and when comparison evidence is fresh.

## Normative requirements

These requirements give every comparison target one safe and durable identity.

| ID          | Requirement                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VD-BASE-001 | Every eligible story MUST have one primary comparison target. Configured mode and wired interaction baselines MUST add independent targets without replacing the primary target.                                                                                               |
| VD-BASE-002 | One canonical baseline resolver and one canonical derived-artifact resolver MUST determine paths for writers, Playwright, Vite injection, static serving, panel hydration, history, results, invalidation, and deletion. Derived paths MUST mirror the traversal-safe baseline path relative to `snapshotDir` beneath `.visual-delta/artifacts/`. |
| VD-BASE-003 | `story-id` and `nested-import` path modes MUST be deterministic, traversal-safe, and collision-resistant. Missing identity data or an unresolved collision MUST fail rather than select another story’s file.                                                                  |
| VD-BASE-004 | Story wiring MUST use `parameters.visualDelta.images`, `modes`, and `interactions`. Middleware MAY inject missing primary wiring only when the matching PNG exists. Optimistic post-write hydration MUST attach only the successfully written target to its originating story. |
| VD-BASE-005 | Version 4 `*.result.json` evidence MUST separate runner status from comparison outcome and identify the exact variant/browser target, original capture operation, current comparison operation, capture profile, baseline, render-input fingerprint, capture configuration, raw-actual checksum, and comparison source. Stale or incomplete evidence MUST NOT establish current result state or authorize actual reuse. |
| VD-BASE-006 | `/visual-baselines` MUST expose only files under the configured snapshot directory. `/visual-delta-artifacts` MUST expose only files beneath `.visual-delta/artifacts` and MUST remain read-only. Baseline and derived URLs MUST remain relative to their respective mounts. |
| VD-BASE-007 | Every primary, mode, and interaction target MUST have an independent `{ browser }` identity. Resolution MUST use the exact selected browser and MUST NOT fall back to another browser. Canonical baseline artifacts MUST encode only that identity in their filename; platform and architecture are capture provenance and MUST NOT participate in lookup. Legacy platform-qualified filenames MUST be rejected after the coordinated migration rather than silently read or rewritten. |
| VD-BASE-008 | Browser coverage for a story's primary baseline MUST require every configured browser. Observed baselines for disabled browsers MUST remain discoverable and filterable but MUST NOT add that browser to the required set. Missing or unresolved primary paths MUST remain distinct coverage values. Modes and interactions MUST NOT affect primary browser coverage. |

## Story eligibility and coverage

A Storybook index entry is eligible when it represents a story and does not contain the `skip-visual` tag. Review tags do not change eligibility.

Coverage has three independent dimensions:

- The primary baseline exists
- Every enabled named mode with a `src` exists
- Every wired interaction entry has an existing `src`

Missing coverage reports `missing-baseline` for the missing target. It does not classify an existing target as mismatched and does not infer review status.

Project browser coverage is the configured browser set. Per-story coverage
checks the primary path for the union of configured browsers and canonical
browser suffixes observed beneath `snapshotDir`; additional disabled browsers
require file-existence checks only and do not enter the required set.

## Canonical baseline identity

A baseline identity contains:

| Field       | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `storyId`   | Stable Storybook story ID                                            |
| `variant`   | Primary, named mode, or interaction                                  |
| `variantId` | Mode slug or interaction `id`, absent for primary                    |
| `pathMode`  | `story-id` or `nested-import`                                        |
| `browser`   | Playwright browser project: `chromium`, `firefox`, or `webkit`       |

The resolver MUST normalize path separators to `/` for public URLs. It MUST reject `..`, absolute paths outside the snapshot root, missing story-ID separators, and malformed variant IDs.

## Path modes and filenames

`story-id` stores a flat path:

```text
{story-id}{variant-infix}-{browser}.png
```

`nested-import` derives a directory from the normalized story import path and a filename from the story slug:

```text
{import-derived-directory}/{story-slug}{variant-infix}-{browser}.png
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
placement, mode, offsets, anchor, and an explicit browser target. A story
parameter MAY declare one target inherited by its explicitly wired primary,
mode, and interaction demo assets. Explicit target metadata exists for
non-canonical teaching fixtures whose URLs do not use baseline filenames; it
MUST NOT override a browser suffix on a canonical baseline artifact or authorize
cross-browser fallback. A mode definition MAY contain globals
without a baseline `src`; such a mode is selectable but does not create coverage
until a baseline is wired.

The Vite injector MUST preserve explicit `parameters.visualDelta`. It MAY inject primary metadata only for a matching file on disk and MUST ignore `skip-visual` stories.

Post-write hydration uses the completed write scope, not whichever story is active when the response arrives. Navigation during a write MUST NOT synthesize or display a baseline URL for the destination story.

## Static mount

The preset maps the configured snapshot directory to `/visual-baselines` and the derived artifact root to `/visual-delta-artifacts`. A host MAY provide equivalent mappings, and the preset MUST avoid conflicting duplicate mounts.

Static serving is read-only. Development mutations operate on verified filesystem paths under the snapshot root and never derive a writable path from an unchecked public URL.

## Sidecars and diagnostic artifacts

Each comparison target MAY have:

| Artifact        | Purpose                                   | Durability                |
| --------------- | ----------------------------------------- | ------------------------- |
| Baseline `.png` | Expected image                            | Committed source of truth |
| `.result.json`  | Structured runner and comparison evidence | Local, derived            |
| `.actual.png`   | Captured image used for diagnosis         | Local, derived            |
| `.diff.png`     | Changed-pixel visualization               | Local, derived            |

Version 4 results MUST keep `runnerStatus` and `outcome` independent. Valid outcomes are `passed`, `changed-within-tolerance`, `mismatch`, `missing-baseline`, `error`, and `skipped`. New readers and writers MUST ignore legacy companions beside baselines rather than migrate or reuse them. Doctor MAY inventory and quarantine those companions, but MUST NOT promote incomplete or legacy evidence into a current version 4 result.

When available, a sidecar records `operationId`, browser target, capture-profile identity and provenance, baseline SHA-256, capture-configuration SHA-256, dimensions, viewport, device scale factor, thresholds, changed-pixel counts, bounds, histogram, policy status, and diagnostic artifact paths. Deprecated platform fields MAY be emitted for compatibility but MUST NOT affect freshness or lookup.

## Freshness

A result is fresh only when:

- Its baseline hash matches the current baseline PNG
- Its render-input and capture-configuration hashes match current effective inputs and settings
- Its raw actual PNG has non-zero dimensions and matches the recorded checksum
- Its capture profile and complete expected capture set match the requested target
- Its story and variant identity match the selected target
- Its operation completed with a terminal runner status

Changing a baseline, capture setting, interaction target, named mode, or eligibility MUST invalidate affected sidecars. Invalidating evidence MUST NOT delete the committed baseline or change review status unless the mutation contract explicitly requires pending review.

Related contracts: [Configuration](./configuration.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [Verification](./verification.md).
