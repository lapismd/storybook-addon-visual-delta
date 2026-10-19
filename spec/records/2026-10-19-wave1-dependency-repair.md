# Wave 1 dependency repair and pending policy review

This follow-up preserves VD-GOV-016 and the blocking release audit. It repairs
available development-tool vulnerabilities and records a separately requested,
inactive proposal for the two unpatched findings. It neither applies an audit
exception nor authorizes any public tag, package or release.

## Actual attempts

- `pnpm audit --json` failed with 33 findings: 11 high, 15 moderate and 7 low.
- Targeted `pnpm update --lockfile-only` refreshed affected resolutions, but its
  output reported pnpm 12.6.0. Repeated the remaining update and complete lock
  generation using explicit `corepack pnpm@10.32.1`, the pinned version.
- `corepack pnpm@10.32.1 update --lockfile-only markdownlint-cli2 mermaid`,
  followed by `corepack pnpm@10.32.1 install --lockfile-only --ignore-scripts`,
  passed. Scoped patched smol-toml and KaTeX overrides avoid expanding the
  exception to dependencies with available repairs.
- Frozen install without CI failed with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Both subsequent
  `CI=true corepack pnpm@10.32.1 install --frozen-lockfile --ignore-scripts`
  runs passed, including the final KaTeX replacement.
- Final `corepack pnpm@10.32.1 audit --json` still exits 1: only
  GHSA-vfj7-8cjw-p6xm (`braces` 3.0.3, high) and GHSA-hp3w-g68c-fv3c
  (`sprintf-js` 1.1.3, moderate), both development-tool dependencies.
- `corepack pnpm@10.32.1 audit --prod --json` exits 0 with zero findings,
  including the repeated final-lock audit.
- `corepack pnpm@10.32.1 typecheck`: pass.
- `corepack pnpm@10.32.1 exec vitest run src/playwright/readiness.spec.ts`:
  3 passed under Vitest 4.1.12.
- `corepack pnpm@10.32.1 spec:check`: all six lanes pass, including 82 script
  tests, architecture, CI image, mdBook and spec-first.
- `corepack pnpm@10.32.1 publint`: pass after rebuilding Node exports; the
  existing canonical repository-URL suggestion is informational.

Local Node is 24.10.0; hosted jobs retain the repository's Node 24.15.0 image.
Local focused evidence does not replace exact-source hosted browser acceptance.
No Playwright/Storybook pin or visual baseline is changed.

The initial readiness/approval source is PR #24 at
`9dd5d40259b228f07ae6c38f0d9510cd518160e1`. Its required checks are independently
tracked. Auto-merge is requested only through normal protected checks; the
generated Version Packages PR and any public-tag dispatch remain unapproved.

The first local push attempt used unsupported JJ `--allow-new` and failed
without pushing. The supported `jj git push --remote origin --bookmark ...`
command succeeded; repository commit signing updated the source commit IDs.

## Still pending

Review the separate audit proposal, qualify this repaired source in hosted CI,
and prepare the final 0.0.8 Version Packages source and tarball. Even if the
policy proposal is approved, public publication needs its own approval and all
other gates. Full audit, public publication and registry-consumer acceptance
are not described as passing.
