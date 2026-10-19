# AGENTS.md — AI Working Agreement For Shot Chat

## Purpose

This file defines how AI agents should work in this project.

The goal is not to move fast at any cost. The goal is to make correct, maintainable, testable changes that preserve the current architecture and migration safety.

## Language

- Reply to the user in Vietnamese unless the user explicitly requests another language.
- Keep explanations concise, concrete, and tied to the current project state.
- Use English for code, file names, commands, environment variables, and test names.

## Source Of Truth For Work State

Before meaningful work, read the relevant GitHub Issue **and its latest comments** for scope,
acceptance and approval amendments; use its PRs for implementation, review and CI evidence.
Read relevant rules and ADRs for durable constraints, then verify implementation in code/tests.
Follow `docs/agents/issue-tracker.md`; do not rely only on chat history.

`current-session.md`, `next-session.md` and `memory/last-session.md` under `.agents/`
are historical checkpoints, not the current roadmap or permission to resume an old slice.
Read them only when relevant to the task, and reconcile them with the live Issue/PR before
acting. Do not replay their old approval gates or overwrite local/untracked checkpoints.
`PROJECT-CONTEXT.md` is also historical; its copied skill shortcuts are not a live catalog.

## Skill Policy

Use the current session's skill catalog to discover availability and the exact `SKILL.md`
location, including user, system and installed-plugin skills. Read that source before use;
do not restrict discovery to one directory or assume an old document proves installation.
Repository-owned document paths and authority rules take precedence over generic skill
output-path defaults; do not create a parallel glossary, plan ledger or knowledge store.

Do not install or activate additional skills without explicit user authorization.

### Workflow Router

- Use `using-superpowers` to select the appropriate workflow at the start of work.
- Use `brainstorming` for requirements, architecture, migration design and unresolved domain decisions.
- Use `writing-plans` to turn approved scope into an implementation plan.
- Use `executing-plans` to execute an approved plan with checkpoints.
- Use `systematic-debugging` to diagnose broken behavior, test failures and performance issues.
- Use `test-driven-development` for behavior changes and regression repairs.
- Use `using-git-worktrees` for isolation when branch/worktree creation is authorized under this repository's Git rules.
- Use `subagent-driven-development` for delegated implementation and `dispatching-parallel-agents` for independent work when authorized.
- Use `requesting-code-review` for review and `receiving-code-review` to assess and handle findings.
- Use `verification-before-completion` before claiming a result is complete or passing.
- Use `finishing-a-development-branch` for the user's integration choice, subject to this repository's Git rules.
- Use `research` for primary-source investigation saved as cited Markdown.
- Use `diagram-design` for standalone diagrams and `writing-skills` for authorized skill authoring.

### Repository Tasks

- Record confirmed domain vocabulary in `.agents/CONTEXT.md` and architectural decisions in `docs/adr/`.
- Prepare and triage issues using `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
- Keep progress, next steps and handoff state in the relevant Issue/PR.
- For debugging, consult relevant entries in `.agents/memory/known-issues.md` and verify them against current code/tests.
- At closeout, follow `docs/agents/issue-tracker.md#selective-closeout`.
- Follow the repository's approved playbooks, runtime invariants and manual acceptance requirements.

These tasks use repository guidance directly; a separate skill is not required. Skill use does
not grant permission to create branches, commit, push, publish issues or deploy.

### Fallback

If no skill fits cleanly, follow this file's default workflow: understand first, plan the smallest safe slice, use tests for implementation, preserve runtime invariants, and report verification.

## Domain Rules

Before modifying code, read the relevant files in `.agents/rules/` based on the area being touched.

Rules are domain/system invariants. They are different from this file:

- `.agents/AGENTS.md` defines how AI should work.
- `.agents/rules/` defines what the system must always obey.

Use this mapping:

- Data ownership, MongoDB, Redis, RabbitMQ, cache, workers: read `.agents/rules/data-ownership.md`.
- Chat identity, `Message.conversationId`, `Conversation._id`, Socket.IO rooms, Redis conversation keys: read `.agents/rules/conversation-identity.md`.
- Conversation Read Model, backfill, dual-write, shadow compare, sidebar migration: read `.agents/rules/conversation-read-model-migration.md`.
- Socket.IO events, presence, typing indicators, realtime ephemeral state: read `.agents/rules/realtime-state.md`.
- Auth, session, tokens, cookies, login/logout/register: read `.agents/rules/auth-session.md`.
- Security findings, credential disposition, scanner exceptions, alert dismissal, or risk acceptance: read `.agents/rules/security-findings.md`.
- Audio/video calls, call history, call logs: read `.agents/rules/calls.md`.

If a requested change violates a rule:

1. Stop before coding.
2. Explain the conflict.
3. Ask for clarification or require an explicit decision update.
4. If approved, update the relevant rule and append a decision to `docs/decisions.md` when the change is technically important.

Do not bypass rules for convenience.
## Project Invariants

Preserve these unless the user explicitly approves a slice that changes them:

- MongoDB is the durable source of truth.
- Redis is cache/coordination only.
- RabbitMQ is background-only.
- Existing client API shapes must remain stable unless a slice explicitly changes them.
- Socket.IO payloads and room identifiers must remain stable unless explicitly approved.
- Avoid exposing backend-internal Mongo `_id` values when a legacy public identifier is the contract.
- Keep migrations incremental, observable, and reversible where possible.

For the current Conversation Read Model migration specifically:

- `Message.conversationId` remains the public/socket/cache bridge.
- `Conversation._id` remains backend-internal.
- Sidebar/search must remain legacy until a dedicated read-switch slice is approved.
- Dual-write must remain guarded by explicit flags.
- Backfill write paths must remain manual-only unless a later slice approves runtime automation.

## Working Style

### Understand Before Editing

Before modifying code:

- Identify the existing data flow.
- Identify callers and side effects.
- Identify tests covering the behavior.
- Check the live Issue/PR and relevant rules/ADRs; consult historical checkpoints only as needed.
- State assumptions if any are necessary.

Do not patch blindly.

### Small Slices

Work in the smallest approved slice that can be tested independently.

Avoid:

- broad rewrites
- unrelated refactors
- opportunistic cleanup
- switching runtime behavior before comparison/verification exists

### TDD For Implementation

For code changes:

1. Add or update failing tests first.
2. Run targeted tests and verify the failure when practical.
3. Implement the minimum change.
4. Run targeted tests.
5. Run broader regression when appropriate.
6. Report exact test results.

If tests cannot be run, report why and provide the safest manual verification steps.

### Runtime Safety

When changing runtime paths:

- Prefer disabled-by-default feature flags.
- Swallow/log non-critical migration errors if legacy behavior must continue.
- Do not change client responses in shadow/compare slices.
- Do not make destructive database/index changes automatically at startup unless explicitly approved.

## Documentation Rules

Update documentation when a durable decision or migration state changes.

Use:

- The relevant Issue/PR for roadmap, slice status, approval amendments and next steps.
- `docs/adr/` for hard-to-reverse architectural decisions with real trade-offs.
- `.agents/CONTEXT.md` for canonical domain vocabulary, not implementation specs.
- `.agents/memory/known-issues.md` for verified recurring pitfalls; link rules/decisions rather than duplicating them.

Keep docs concise. Do not copy entire conversations or refresh historical session snapshots as a second tracker.

## Git And File Safety

- Do not commit or push unless the user explicitly asks.
- Do not create or delete branches unless the user explicitly asks.
- Do not delete files or run destructive commands without explicit approval.
- Keep changes inside the workspace.
- Prefer minimal patches over large rewrites.

## Reporting Format

When finishing an implementation task, report:

- files changed
- behavior changed
- tests added/updated
- targeted test result
- full regression result if run
- manual verification checklist if relevant
- remaining risks or next slice

When finishing a planning/zoom-out task, report:

- current architecture map
- risks
- recommended next slice
- why alternatives are not next
- tests/manual checks needed
- explicit non-goals

## Definition Of Done

A task is done only when:

- the requested slice is completed and no extra slice was started
- requirements and constraints are satisfied
- tests/manual checks are reported
- runtime behavior remains within the approved scope
- durable state docs are updated when needed

## Forbidden Behaviors

Never:

- switch source of truth without an approved slice
- expose internal IDs accidentally
- silently change API/socket payloads
- alter Redis/RabbitMQ behavior outside the approved scope
- add startup migrations for risky database/index changes without approval
- claim success without verification
- continue implementing beyond the requested slice

## Playbook Execution And Recovery

- Read the requested playbook completely before executing it; honor its branches and stop conditions.
- Inspect the implementation script when behavior is unclear. If it conflicts with the playbook,
  report the mismatch before the affected action; executable behavior is evidence, not permission.
- Do not hide runtime failures. Report completed, blocked and failed steps with actual commands,
  exit codes or file/evidence links; never substitute a success label for verification.
- Before a destructive action, identify exact affected files, data, images or volumes and obtain
  explicit authorization. Previously approved unattended retention steps may run only within
  their documented scope; ambiguity requires clarification.
- Never print secrets or whole `.env` contents. Report missing key names only; when authorized to
  generate a secret, store it securely without echoing its value in tools, logs or chat.
- On interruption, resume from the relevant Issue/PR and task-specific evidence after checking the
  current workspace/runtime. Old session notes alone do not prove completion or authorize replay.
- Keep output concise with focused diffs and evidence links. There is no model-specific requirement
  to print full files or stop after each ordinary step already covered by the user's approval.



