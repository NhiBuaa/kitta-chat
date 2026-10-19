# Domain Docs

This repository uses a single shared domain context.

## Sources Of Truth

- `.agents/CONTEXT.md` — canonical glossary and domain language.
- `.agents/rules/` — system and domain invariants that implementation must preserve.
- `docs/adr/` — accepted architectural decisions and their trade-offs.
- Relevant GitHub Issues and their latest comments — scope, progress and approval amendments.
- Related PRs — implementation, review and verification evidence.

Do not create a second root `CONTEXT.md` or `GLOSSARY.md`; reuse `.agents/CONTEXT.md`.
These repository-owned paths take precedence over generic skill output-path defaults.
Session snapshots and `PROJECT-CONTEXT.md` are historical references, not current authority.

## Before Exploring Or Writing Issues

1. Read `.agents/CONTEXT.md`.
2. Read the rules relevant to the area being changed.
3. Read ADRs that touch the proposed behavior.
4. Read the relevant Issue, its latest comments and PRs. Consult old checkpoints only when
   relevant, and reconcile their claims with current evidence before acting.

## Vocabulary

Use the terms defined in `.agents/CONTEXT.md` in issue titles, acceptance criteria, tests, and design discussions. If a required concept is missing or conflicts with existing language, resolve its meaning with the user and update the canonical documentation. Select any supporting design skill through the policy in `.agents/AGENTS.md`.

## Conflicts

If a proposal contradicts an existing rule or ADR, surface the conflict explicitly. Do not silently override the existing decision or implementation boundary.
