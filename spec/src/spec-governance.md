# Visual Delta specification governance

This reference defines how the specification leads implementation, which changes require a specification update, and how local and continuous-integration checks enforce that contract.

## Normative requirements

These requirements prevent implementation, tests, and generated documentation from silently redefining Visual Delta.

| ID         | Requirement                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-GOV-001 | Markdown under `spec/src/` MUST be the canonical Visual Delta contract for humans and agents. The generated mdBook, implementation, tests, READMEs, and other non-canonical documentation MUST NOT override it.                                               |
| VD-GOV-002 | Visual Delta implementation MUST never be ahead of the specification. A protected behavior or integration change MUST update the relevant canonical requirement before or in the same logical slice; a code-only behavior change is prohibited.               |
| VD-GOV-003 | An intentional contract change MUST update `verification.md` with focused evidence or a declared gap. Passing tests MUST NOT authorize behavior that the canonical specification does not define.                                                             |
| VD-GOV-004 | The spec-first gate MUST cover portable production code and repository-owned Visual Delta host integration. Tests, fixture stories, ordinary catalog stories, visual baselines, derived artifacts, and generated output MUST NOT trigger or satisfy the gate. |
| VD-GOV-005 | Local enforcement MUST inspect the current Jujutsu change, and pull-request enforcement MUST inspect the exact base-to-head change set. Failure to determine the change set MUST fail closed and report the unresolved scope.                                 |
| VD-GOV-006 | A code-to-spec mismatch MUST be treated as an implementation defect unless an explicit specification change is accepted. Weakening a requirement requires rationale and MUST NOT be disguised by editing non-normative documentation.                         |
| VD-GOV-007 | The package root MUST retain exactly `AGENTS.md`, `DEVELOPMENT.md`, and `README.md` as Markdown files. The obsolete `specs/` tree and package-root historical contract or plan files MUST NOT exist. Links to normative content MUST target `spec/src/`.      |

## Authority and timing

Edit the canonical requirement before editing behavior. The specification and implementation MAY land in one logical commit or pull request, but the implementation must not establish an undocumented interim contract.

When intent remains unchanged, preserve the requirement ID. Add a new ID for a distinct obligation. Removing or weakening a requirement requires an explicit rationale in the change description.

If the implementation already contradicts the specification, either:

- Fix the implementation to conform, or
- Propose and review an explicit specification change before relying on the new behavior

Tests reproduce or verify the contract. They do not create it.

## Protected boundary

The gate protects:

- Portable production source and package configuration
- Visual Delta Storybook registration, middleware, baseline integration, and project configuration
- Playwright configuration and Storybook process supervision used by Visual Delta
- Repository-owned visual writers and shared command surfaces when their changed lines concern Visual Delta
- Spec enforcement scripts, command wiring, and continuous-integration workflow

The gate ignores test-only changes, test fixtures, ordinary component stories, committed component baseline PNGs, build output, caches, reports, and the generated mdBook. An ignored change that reveals or introduces behavior still requires a deliberate specification update under `VD-GOV-002`.

Only a canonical content page under `spec/src/` satisfies the gate. `SUMMARY.md`, generated HTML, package-root Markdown, or a document under the obsolete `specs/` path does not.

## Enforcement

Run the complete local policy check from the repository root:

```bash
pnpm spec:check
```

The component commands are:

- `pnpm spec:lint`
- `pnpm spec:validate`
- `pnpm spec:build`
- `pnpm spec:serve`
- `pnpm spec:first`

The complete check also runs the checker test suite. It runs near the start of `pnpm checks`, before implementation typechecking and browser validation.

On a pull request, the required **Visual Delta Spec First / Validate Visual Delta specification** check compares the exact base and head revisions. Repository settings MUST keep that check required before merge. The workflow pins Node 22, pnpm 10.32.1, and mdBook 0.5.4.

Path-filtered **Visual Delta CI** (`.github/workflows/visual-delta-ci.yml`) runs package typecheck and Vitest, panel browser acceptance, and host catalog visual compare when Visual Delta or catalog paths change. Spec First remains the contract merge gate; repository settings SHOULD enable the Visual Delta CI checks as required once they are stable on the default branch.

The gate reports every protected path when no canonical content page changed. If it cannot obtain or parse a trustworthy change set, it fails closed. Remediation is to update the relevant stable requirement and [verification evidence](./verification.md), not to add a token spec edit or weaken path protection.

Structural validation MUST reject a reintroduced `specs/` tree and any package-root Markdown set other than `AGENTS.md`, `DEVELOPMENT.md`, and `README.md`.

## Agent workflow

For every protected change:

1. Inspect Jujutsu status and preserve unrelated work.
2. Read the relevant canonical pages and requirement IDs.
3. Update the requirement before changing behavior.
4. Update [Verification](./verification.md) with evidence or a declared gap.
5. Implement the smallest conforming change and focused regression coverage.
6. Run the specification gate and boundary-appropriate validation.
7. Commit the verified slice with only its specification, implementation, and evidence.

Generated `spec/book/` output is local and disposable. Commit `book.toml`, `SUMMARY.md`, and Markdown source, never rendered HTML.

Related contracts: [System specification](./index.md), [UI catalog host profile](./host-profile.md), and [Verification](./verification.md).
