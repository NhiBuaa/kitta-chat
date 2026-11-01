# Agent Working Agreement

The repository entrypoint and authority map are [AGENTS.md](../../AGENTS.md).
This file owns detailed agent workflow. Software/domain rules belong in
[standards](../../docs/04-standards/README.md), not this agreement.

## Communication

- Reply in Vietnamese unless the user requests another language; keep explanations
  concise, concrete and tied to actual evidence.
- Use English for code, filenames, commands, environment variables and test names.
- State material assumptions and unresolved conflicts before changing dependent work.

## Workflow Router

Use applicable installed skills from the current session's catalog:

- `using-superpowers`: select the workflow at the start of work.
- `brainstorming`: unresolved requirements, architecture, migration or domain decisions.
- `writing-plans`: turn approved scope into an implementation plan.
- `executing-plans`: execute an approved plan with checkpoints.
- `systematic-debugging`: broken behavior, test failures or performance issues.
- `test-driven-development`: behavior changes and regression repairs.
- `using-git-worktrees`: isolation within the user's branch/worktree authorization.
- `subagent-driven-development` / `dispatching-parallel-agents`: delegated or independent
  work when delegation is authorized; parallelize only across independent boundaries.
- `requesting-code-review` / `receiving-code-review`: review and evaluate findings.
- `verification-before-completion`: verify before claiming completion or passing checks.
- `finishing-a-development-branch`: integration choices within repository Git permissions.
- `research`: primary-source investigation when required by the task.
- `diagram-design`: standalone diagrams; `writing-skills`: authorized skill authoring.

An unavailable skill is not proof of permission to install it. If no skill fits, follow
the workflow below. Do not create a second glossary, plan ledger or knowledge store
to satisfy a skill's generic output-path default.

## Before Editing

1. Establish the current task, approved scope/version, assigned branch/worktree and
   unfinished step. Verify their actual Git state; preserve unrelated changes.
2. Read the live Issue/latest comments and relevant PRs, standards and ADRs.
3. Identify the data flow, callers, side effects and tests. For debugging, consult
   relevant [known issues](../memory/known-issues.md) and verify them against code/tests.
4. Plan the smallest independently verifiable slice. Avoid unrelated cleanup, broad
   rewrites or runtime read switches before the required comparison/verification exists.

If a standard or ADR conflicts with the requested slice, stop the affected work, explain
the conflict and obtain an explicit update. Record an important approved technical
decision in the existing [decision log](../../docs/decisions.md) or owning ADR.

## Implementation And Verification

- For behavior changes, add/update the regression first, confirm the expected failure
  when practical, implement the minimum fix, run targeted checks, then broaden only
  for a concrete regression risk or required gate. Report exact results.
- Documentation-only changes need structural/link/ownership checks rather than new
  application tests that mirror prose.
- Preserve approved disabled-by-default migration flags. Non-critical migration errors
  may be logged/handled only where the legacy fallback contract requires it.
- Shadow/compare work preserves client responses. Risky data/index/startup migrations
  require explicit approval; manual backfill is not permission for startup automation.
- Read a requested playbook fully and honor its branches and stop conditions. If its
  script disagrees, report the mismatch before the affected action; executable behavior
  is evidence, not authority to act. Expose failures rather than suppressing them.
- Before a destructive action, name the exact files, data, images or volumes and obtain
  authorization. Approved unattended retention steps remain bounded by their policy.
- Never print secrets or whole `.env` contents. Report missing key names only; store an
  authorized generated secret securely without echoing its value.

## Closeout And Recovery

- Follow [selective closeout](../../docs/agents/issue-tracker.md#selective-closeout).
  Update an existing knowledge owner when a reusable fact is verified; no new lesson
  is a valid outcome. Keep progress, approvals and next steps in the Issue/PR.
- Report files/behavior changed, targeted verification, broader checks actually run,
  relevant manual checks, remaining risks and any next approved slice. For planning,
  include boundaries, alternatives and required evidence without inventing authority.
- Completion requires the requested slice, its constraints, relevant verification and
  necessary durable-doc updates; do not start an extra slice or claim unverified success.
- After interruption, reconcile live work sources and task evidence with the current
  workspace/runtime. Old session checkpoints and copied skill shortcuts are historical;
  preserve their bytes, locked guides, append-only evaluations and local/untracked files.
