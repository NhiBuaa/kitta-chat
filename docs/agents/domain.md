# Domain Docs

This repository uses a single shared domain context.

## Sources Of Truth

- `.agents/CONTEXT.md` — canonical glossary and domain language.
- `.agents/rules/` — system and domain invariants that implementation must preserve.
- `docs/adr/` — accepted architectural decisions and their trade-offs.
- `.agents/current-session.md` — current roadmap and overall invariants.
- `.agents/next-session.md` — next approved target slice and session guardrails.

Do not create a second root `CONTEXT.md`; it would duplicate the canonical glossary in `.agents/CONTEXT.md`.

## Before Exploring Or Writing Issues

1. Read `.agents/CONTEXT.md`.
2. Read the rules relevant to the area being changed.
3. Read ADRs that touch the proposed behavior.
4. Read the current and next session files when the work is part of an approved implementation slice.

## Vocabulary

Use the terms defined in `.agents/CONTEXT.md` in issue titles, acceptance criteria, tests, and design discussions. If a required concept is missing or conflicts with existing language, resolve it through the domain-modeling workflow rather than inventing an undocumented synonym.

## Conflicts

If a proposal contradicts an existing rule or ADR, surface the conflict explicitly. Do not silently override the existing decision or implementation boundary.
