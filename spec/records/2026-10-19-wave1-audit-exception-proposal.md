# Wave 1 audit exception proposal

**Proposal only. No exception, publication, audit suppression or workflow
bypass is authorized or implemented.** The user requested this proposal on
2026-10-19 after reviewing the unpatched dependency blocker.

## Candidate and exact scope

- Package: `@lapismd/storybook-addon-visual-delta`, planned patch `0.0.8`.
- Source readiness/approval PR: [24](https://github.com/lapismd/storybook-addon-visual-delta/pull/24).
- This proposal applies only to the dependency-repair follow-up and the final
  reviewed Version Packages SHA. Record that exact SHA and candidate tarball
  integrity before approval; this document does not approve a floating branch.
- Reviewed lock SHA-256:
  `969a2edc51d4de810cc5a008bdc9939e9e11228a06877214236915728b484864`.
- Proposed maximum expiry: **2026-11-02 00:00 UTC**, or publication of a patched
  affected dependency, or completion of this single release, whichever is first.
- Owner: the LapisMD release operator. No later version inherits the exception.

| Exact advisory                                                           | Locked package     | Severity | Development path                                                               | Proposed disposition                                         |
| ------------------------------------------------------------------------ | ------------------ | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces@3.0.3`     | High     | Changesets/config → micromatch → braces; Markdown tooling also uses micromatch | Temporarily accept only this locked development-tool finding |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | `sprintf-js@1.1.3` | Moderate | Changesets → manypkg → YAML reader → argparse → sprintf-js                     | Temporarily accept only this locked development-tool finding |

npm currently lists no patched version for either advisory. The first is
stack-exhaustion denial of service from deeply nested patterns; the second is
unbounded precision-format denial of service. They remain real CI/tooling
availability risks. Changesets receives reviewed release configuration, while
untrusted PR checks retain read-only permissions and bounded job lifetimes.
This is risk containment, not a claim that the vulnerabilities are fixed.

Neither package belongs to the production dependency graph. Exact registry
production audit reports zero findings. Source/export inspection found no
imports of those modules, micromatch, fast-glob, Changesets or js-yaml in
published runtime source or built exports; matches for a local variable named
`braces` in the story-source parser are unrelated. Recheck both graph and
runtime imports on the final version candidate.

## Repairs made before requesting an exception

The initial audit reported 33 findings: 11 high, 15 moderate and 7 low.
Targeted registry dependency refreshes and patched Markdown-tool dependencies
reduce this to exactly the two findings above: one high and one moderate.

- Refresh the affected Vitest, DOMPurify, devalue, Undici, brace-expansion,
  source-map-js and Markdown-tool dependency resolutions.
- Use Markdownlint CLI `^0.23.3` and Vitest `^4.1.12` within their existing lines.
- Scope patched replacements to `markdownlint-cli2>smol-toml@1.9.0`,
  `micromark-extension-math>katex@0.18.2` and `mermaid>katex@0.18.2`.
- Keep product dependency declarations, Storybook/Playwright pins and visual
  baselines unchanged. Native ARM64/browser checks remain required.

## Proposed implementation if explicitly approved

Replace only the release workflow's unconditional audit exit handling with a
repository-owned, tested policy check. It must retain the complete raw audit
report as an artifact and meet all of these conditions:

1. Run the real registry audit and fail closed on registry errors, malformed or
   incomplete reports. Do not set global `audit=false` or add a blanket ignore.
2. Bind the exception to package `0.0.8`, the exact approved source and lock
   digest, and the expiry above. Any mismatch or expired approval blocks it.
3. Allow only the two exact advisory/package/version tuples above and only
   while every affected instance is development-only. Any production path or
   additional advisory blocks publication, regardless of severity.
4. Recheck published versions before releasing. An available fix ends the
   exception and requires dependency repair; a missing finding needs no waiver.
5. Require a clear production audit, the existing unit/spec/package gates,
   compare-only ARM64 browser checks, candidate inspection, npm review,
   provenance verification and separate public-release approval.
6. Test rejection of additional findings, production paths, changed locked
   versions/source, expiry, incomplete/error reports and newly available fixes.
   Keep ordinary PR audit behavior unchanged where an audit gate exists.

The alternate decision is to keep the wave blocked until fixes or a qualified
replacement tooling chain is available. A Changesets major migration is a
separate possible repair, not silently included in this patch.

## Actual evidence and remaining work

- `corepack pnpm@10.32.1 audit --json`: exits 1 with exactly the two findings;
  the current release workflow therefore still blocks publication.
- `corepack pnpm@10.32.1 audit --prod --json`: exits 0, zero findings.
- `rg` inspection of `src` and `dist`: no affected dependency imports found.
- The first unpinned update invocation reported pnpm 12.6.0; regeneration and
  audit were repeated with explicit Corepack pnpm 10.32.1, the repository pin.
- Frozen install initially refused non-TTY module replacement; rerun with
  `CI=true` and scripts disabled completed. A final install/check follows the
  last scoped KaTeX resolution.
- Fresh checks for the repaired dependency tree, final source/lock/package
  identity, exact hosted CI and clean consumer evidence remain separate gates.

Approval of this policy proposal would authorize only its bounded implementation.
It would not approve public tags, npm publication or a GitHub release.
