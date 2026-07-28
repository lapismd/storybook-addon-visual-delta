# Storybook layout-aware Visual Delta alignment

> Historical implementation record. Use the
> [`Visual Delta system specification`](./specs/index.md) for the normative
> contract.

Status: implemented; addon validation complete, with unrelated aggregate shell
failures recorded below

## Goal

Align Visual Delta overlays from the loaded story's settled Storybook geometry
instead of addon-owned padding assumptions. Catalog layout defaults, story
wrappers, shell CSS, and committed baselines remain unchanged.

## Implementation tracker

- [x] Capture `PreviewLayoutSnapshot` only after `storyFinished`, fonts, and two
      stable animation frames at the selected baseline viewport.
- [x] Queue auto-selection until measurement completes; do not fall back to a
      fixed inset.
- [x] Cache snapshots by story, render generation, and baseline viewport.
- [x] Reconstruct body/root/subject outer insets for component-clipped
      baselines.
- [x] Use zero reconstructed inset for viewport-aligned or viewport-cropped
      baselines.
- [x] Center equivalent live and baseline frames for centered Storybook
      layouts.
- [x] Remove the 16px comparison allowance and the 24px Baseline-chip gutter
      from overlay layout.
- [x] Recreate measured body/root backgrounds without adding an opaque overlay
      fallback.
- [x] Restore preview dimensions, scroll, focus, and inline styles when the
      overlay is hidden.

## Representative coverage

- [x] Padded component story with asymmetric root padding and subject margins.
- [x] Full-bleed/full-height story with zero body and root padding.
- [x] Body-padded story.
- [x] Centered Storybook layout.
- [x] Page-shell story captured as the complete viewport.
- [x] Transparent body and root backgrounds.
- [x] Baselines captured at different declared viewports.
- [x] All placements: left, right, above, below, and center.

## Validation

- [x] Focused addon unit tests and typecheck: 138 files / 654 tests passed; both
      addon TypeScript builds passed.
- [x] Storybook interaction tests and static build: static build passed and all
      Visual Delta stories passed. The aggregate interaction run remains
      blocked by three to four failures in the pre-existing dirty
      `src/shared/shell/AppShell.stories.svelte` work.
- [x] `pnpm test:visual-delta-panel` on isolated ports: 40/40 passed.
- [x] Compare-only `pnpm test:visual`: 350/360 passed; the ten failures are
      dirty shell stories without committed baseline PNGs. No baselines were
      written.
- [x] `pnpm checks`: formatting, Svelte diagnostics, package typechecks,
      no-Tailwind checks, and unit tests passed before the command stopped on
      the same unrelated AppShell interaction failures.

Baseline updates are intentionally out of scope and remain separately gated.
