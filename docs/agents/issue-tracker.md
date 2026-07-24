# Issue Tracker: GitHub

GitHub Issues in `NhiBuaa/kitta-chat` are the source of truth for planned and triaged work.

## Tooling

- Prefer the configured GitHub integration when it is available.
- Use the `gh` CLI as the shell fallback when running inside this repository clone.
- Infer the repository from the configured Git remote unless an operation explicitly targets another repository.

## Conventions

- Publish dependency blockers before the issues that reference them.
- Do not close or modify a parent issue when creating related implementation issues.
- Issues prepared for autonomous implementation must use the `ready-for-agent` label.
- Use the repository's configured triage vocabulary from `docs/agents/triage-labels.md`.
- Write end-to-end behavior and acceptance criteria rather than a stale list of implementation files.

## Ready Issue Shape

Agent-ready implementation issues use these sections:

```markdown
## What to build

A concise description of the complete behavior delivered by this slice.

## Acceptance criteria

- [ ] Verifiable criterion

## Blocked by

- Issue reference, or `None - can start immediately`
```

## Common Operations

- Create: `gh issue create --title "..." --body-file <path>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "ready-for-agent"`
