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
- Read the Issue and its latest comments for approval amendments; use PRs for review/CI evidence.
  Historical session checkpoints do not override these sources or authorize work.

## Selective closeout

At normal Issue/PR closeout, consider only verified, reusable findings; none is a valid outcome.

- Check code/tests or an accepted decision and link the source Issue/PR/comment or commit.
  Keep proposed, implemented, accepted, merged and deployed states distinct.
- Reuse the existing owner: `.agents/CONTEXT.md` for vocabulary, `docs/adr/` for architecture,
  `.agents/rules/` for invariants, the relevant runbook/playbook for operations, and
  `.agents/AGENTS.md` for routing. For recurring bugs, use `.agents/memory/known-issues.md`
  with symptom, cause, fix and prevention; prefer a regression test for executable behavior.
  Link existing knowledge rather than copying it; no new skill, hook or knowledge store is needed.
- Apply small, safe corrections within the already approved scope without asking again.
  Include them in the normal diff and completion report.
- Propose out-of-scope policy, architecture or knowledge-authority changes for approval before
  applying them; append important approved decisions to `docs/decisions.md` under existing rules.
  Do not block unrelated approved completion. This does not grant publication, installation,
  deployment, destructive-action or permission changes.
- Keep progress in the Issue/PR. Preserve historical evidence and untracked files.
  Memory and old notes aid retrieval; verify them before relying on them.

Report briefly: no reusable finding, updated owner + evidence, or an out-of-scope proposal.

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
