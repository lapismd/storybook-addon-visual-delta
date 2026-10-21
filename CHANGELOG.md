# @lapismd/storybook-addon-visual-delta

## 0.0.9

### Patch Changes

- [#35](https://github.com/lapismd/storybook-addon-visual-delta/pull/35) [`3ad36b9`](https://github.com/lapismd/storybook-addon-visual-delta/commit/3ad36b9854253a9659bf44a910666f3a57aaca1d) Thanks [@stevejuma](https://github.com/stevejuma)! - Build a missing canonical Storybook before resolving cold comparison targets,
  and safely clean isolated Docker stages created by container root on Linux.
  Keep dry-run and exact-empty scopes, baseline safety and capture identity intact.

## 0.0.8

### Patch Changes

- [#28](https://github.com/lapismd/storybook-addon-visual-delta/pull/28) [`34cdb66`](https://github.com/lapismd/storybook-addon-visual-delta/commit/34cdb6633df81b0b9c212adc929e3ac382f39bd1) Thanks [@stevejuma](https://github.com/stevejuma)! - Use the reviewed Playwright 1.62.1 browser image for canonical captures and
  verify its selected version in the Docker runner's doctor.

- [#24](https://github.com/lapismd/storybook-addon-visual-delta/pull/24) [`979a4d3`](https://github.com/lapismd/storybook-addon-visual-delta/commit/979a4d3ca02b33a6806a4a0696b460abc2951296) Thanks [@stevejuma](https://github.com/stevejuma)! - Keep the exact-story readiness wait pending while navigation temporarily removes
  the document root, preserving its configured timeout and story identity.

## 0.0.7

### Patch Changes

- [`7f8e6fd`](https://github.com/lapismd/storybook-addon-visual-delta/commit/7f8e6fdfb21ddd136fa07b97136f07dbd6cb9b98) Thanks [@stevejuma](https://github.com/stevejuma)! - Probe warm static Storybook artifacts without retaining unread response bodies.

- [`d988291`](https://github.com/lapismd/storybook-addon-visual-delta/commit/d988291965a5eea0747fcbc85b7ff06bbb59a164) Thanks [@stevejuma](https://github.com/stevejuma)! - Resolve release audit advisories by using patched Mermaid, DOMPurify, PostCSS, and nanoid dependency versions.

- [`908e694`](https://github.com/lapismd/storybook-addon-visual-delta/commit/908e69460cc59bba6253a74dfbe2485daa8ffd59) Thanks [@stevejuma](https://github.com/stevejuma)! - Expose result invalidation, static-build freshness helpers, baseline existence checks, and review tag helpers from the public Node adapter.

- [`4b51e01`](https://github.com/lapismd/storybook-addon-visual-delta/commit/4b51e01567b89718e05a679d0d8880a7dad5f8d2) Thanks [@stevejuma](https://github.com/stevejuma)! - Stage a linked source checkout's pnpm workspace configuration so its frozen
  container install retains package-manager overrides.
