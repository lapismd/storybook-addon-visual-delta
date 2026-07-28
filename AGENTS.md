# Visual Delta agent guide

## Canonical specification

[`spec/src/`](./spec/src/index.md) is the source of truth for Visual Delta architecture, interfaces, behavior, host integration, safety policy, and acceptance criteria.

Before changing behavior, read:

- [System specification](./spec/src/index.md)
- [Specification governance](./spec/src/spec-governance.md)
- [Verification map](./spec/src/verification.md)

The implementation must never be ahead of the specification. Update the relevant stable requirement and its verification evidence before editing behavior, or include both in the same logical slice with the specification edit first.

A code-only behavior change is prohibited even when tests pass. Source, tests, READMEs, generated mdBook output, compatibility pointers, provenance notes, parity notes, and historical plans are evidence or explanation; they cannot redefine the canonical contract.

When code and specification disagree, treat the code as defective unless an explicit specification change is accepted. Do not weaken or bypass a requirement through non-normative documentation.

## Protected system boundary

The contract covers both:

- Portable addon source under this package
- Repository-owned host adapters in `.storybook`, `.visual-delta`, Playwright configuration, Storybook process supervision, and `scripts/ui-generator` visual writers

Keep portable behavior in the package and repository policy in host adapters. Do not duplicate canonical path, capture, readiness, result, or mutation rules across those boundaries.

## Workflow

1. Inspect `jj --no-pager st` and preserve unrelated changes.
2. Read the relevant specification page and requirement IDs.
3. Update the specification and verification map before implementation.
4. Add focused regression evidence for the changed boundary.
5. Run `pnpm visual-delta:spec:check`.
6. Run package typecheck and focused unit or browser acceptance as required by [Verification](./spec/src/verification.md).
7. Commit the verified slice with Jujutsu.

Before handoff, run the repository checks appropriate to the change and report unrelated failures separately.

## Baseline safety

Never create, replace, or delete a committed visual baseline unless the user explicitly authorizes that mutation. Compare-only validation must not pass snapshot-update flags or broaden an empty target.

Generated `spec/book/` output is ignored and non-normative. Commit only mdBook configuration, source, and enforcement tooling.
