# Domain Docs

This repository uses one canonical glossary and separates it from current project orientation.

## Sources Of Truth

- `PROJECT-OVERVIEW.md` — project foundation and explicit open questions.
- `CONTEXT.md` — bounded, dated project orientation.
- `docs/03-product/glossary.md` — canonical glossary and domain language.
- `docs/04-standards/` — system and domain invariants for human and agent implementations.
- `docs/adr/` — accepted architectural decisions and their trade-offs.
- `AGENTS.md` — repository-wide agent entrypoint and routing.
- `.agents/rules/working-agreement.md` — detailed agent-only workflow.
- Relevant GitHub Issues and their latest comments — scope, progress and approval amendments.
- Related PRs — implementation, review and verification evidence.

Use the [documentation map](../README.md) for category navigation; established architecture,
ADR, spec and operational files retain their existing paths. Indexes link rather than copy.
The former `.agents/CONTEXT.md`, `.agents/AGENTS.md` and domain-rule paths are compatibility
pointers, not competing owners. These repository paths take precedence over generic skill
defaults; do not create another glossary or task ledger.

Session snapshots and `PROJECT-CONTEXT.md` are historical references, not current authority.
Preserve historical evidence at its original paths as described in [.agents/README.md](../../.agents/README.md).

## Before Exploring Or Writing Issues

1. Read `docs/03-product/glossary.md` for relevant terms and root context files for orientation.
2. Read the standards relevant to the area being changed.
3. Read ADRs that touch the proposed behavior.
4. Read the relevant Issue, its latest comments and PRs. Consult old checkpoints only when
   relevant, and reconcile their claims with current evidence before acting.

## Vocabulary

Use the terms defined in `docs/03-product/glossary.md` in issue titles, acceptance criteria,
tests and design discussions. If a required concept is missing or conflicting, resolve its
meaning with the user and update that owner. Select supporting skills through `AGENTS.md`.

## Conflicts

If a proposal contradicts an existing rule or ADR, surface the conflict explicitly. Do not silently override the existing decision or implementation boundary.
