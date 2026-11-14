# Follow-up tooling image bootstrap

The remaining Dependabot proposals 68–72 are combined with their queued
compatible tooling updates rather than replaying stale independent lockfiles.
The candidate uses Storybook 10.6.7, Vitest 5.1.0, Svelte 5.57.3, user-event
14.6.10, PostCSS 8.5.33, paired Playwright 1.65.1, Vite 8.3.8, Svelte Vite
plugin 7.3.1, Mermaid 12.3.0 and markdownlint CLI 0.50.0. The pinned image
Node 24.15.0, npm 12.0.2, pnpm 10.32.1 and mdBook 0.5.4 remain unchanged.
No committed visual baseline is modified.

This first commit is an image-build input, not a merge-ready capture profile.
The reviewed immutable 1.65.0 image and its strict guard remain until the new
multiarchitecture image is published and its actual inventory inspected.
Consequently `pnpm ci:image:check` correctly reports two version mismatches,
and the corresponding real-repository script test fails on those same two
findings. The full specification gate stops there. Neither the guard nor that
assertion is weakened to bootstrap the image.

On the candidate dependency graph, package typecheck passes. The pinned Node
24.15.0/pnpm 10.32.1 unit command passes all 619 cases; Node build and a fresh
static Storybook build also pass under that pinned toolchain. Full audit still
contains exactly one LOW development-only deepmerge finding; production audit
contains zero findings. No audit exception is added or inherited. The image
bootstrap does not authorize npm publication or waive VD-GOV-008.

Next gates are exact-source immutable image publication, both architecture
smokes and capture-profile assembly, pin promotion with guard/script/spec
revalidation, and the complete compare-only browser matrix. Final source
qualification and public package release remain separately gated.
