# Visual Delta specification governance

This reference defines how the specification leads implementation, which changes require a specification update, and how local and continuous-integration checks enforce that contract.

## Normative requirements

These requirements prevent implementation, tests, and generated documentation from silently redefining Visual Delta.

| ID         | Requirement                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-GOV-001 | Markdown under `spec/src/` MUST be the canonical Visual Delta contract for humans and agents. The generated mdBook, implementation, tests, READMEs, plans, and compatibility pointers MUST NOT override it.                                                   |
| VD-GOV-002 | Visual Delta implementation MUST never be ahead of the specification. A protected behavior or integration change MUST update the relevant canonical requirement before or in the same logical slice; a code-only behavior change is prohibited.               |
| VD-GOV-003 | An intentional contract change MUST update `verification.md` with focused evidence or a declared gap. Passing tests MUST NOT authorize behavior that the canonical specification does not define.                                                             |
| VD-GOV-004 | The spec-first gate MUST cover portable production code and repository-owned Visual Delta host integration. Tests, fixture stories, ordinary catalog stories, visual baselines, derived artifacts, and generated output MUST NOT trigger or satisfy the gate. |
| VD-GOV-005 | Local enforcement MUST inspect the current Jujutsu change, and pull-request enforcement MUST inspect the exact base-to-head change set. Failure to determine the change set MUST fail closed and report the unresolved scope.                                 |
| VD-GOV-006 | A code-to-spec mismatch MUST be treated as an implementation defect unless an explicit specification change is accepted. Weakening a requirement requires rationale and MUST NOT be disguised by editing non-normative documentation.                         |

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

Only a canonical content page under `spec/src/` satisfies the gate. `SUMMARY.md`, generated HTML, a legacy `specs/` pointer, README text, or a historical plan does not.

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
