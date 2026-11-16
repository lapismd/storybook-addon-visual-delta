# Node version-tooling declaration

VD-GOV-011/012/016 and the existing public/runtime contract remain unchanged.
The owner manifest declares pnpm10.32.1, which is already explicit in the
version command, workflow and CI image. The workspace-required Deno-free
validator update is0.2.0→0.2.1. No public product bump, runtime dependency,
version command, formatter, image profile or publication authority changes.
The empty Changeset records the public-manifest maintenance intent.

This is a prerequisite for actual source-bound runtime qualification: the
shared guard requires a declared exact package manager, while this source had
only a workflow-owned pnpm pin. A declaration alone is not whole-recipe proof
and does not activate a guard or remove the existing token/approval boundaries.
The existing `corepack pnpm@10.32.1` command must remain intact in any later
restricted-path proof; no easier version recipe is substituted.

Semantic search reports QMD disabled and the documented rg fallback is used.
System scope, governing package/version rules and relevant verification rows
were reviewed before metadata edits. Source checks, clean full/production audit
and exact changed lock scope are recorded before commit. Other runtime/baseline
work and any old release exception remain outside this candidate's authority.

## Executed source acceptance

The exact lock diff is10 lines, solely validator0.2.1 identity/integrity; no
renderer, peer snapshot or transitive override changes. Frozen installation
passes, and actual declared pnpm reports10.32.1. Product version remains0.1.5.
`pnpm release:intent` accepts the explicit empty maintenance note.

`pnpm check` passes types,619 unit tests, all seven spec lanes (including
Markdown lint, repository script controls, architecture and CI-image contract),
Node build/executable CLI preparation and package lint. Full and production
`pnpm audit --json` each report zero findings and empty muted lists. No audit
exception is requested or inherited for this candidate. Doctor reports7 passes
and the retained custom-alias warning; QMD remains intentionally disabled.
An ad hoc Prettier invocation is unavailable because the repository does not
install that formatter; the governed Markdown-lint/spec lanes above pass.

Current-head hosted package/panel/manager/browser checks, merged-main rollout
and actual whole-version qualification remain pending. No capture, baseline,
new image or npm release is inferred from these source/tooling checks.
