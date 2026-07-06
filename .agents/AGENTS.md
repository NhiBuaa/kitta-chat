# AGENTS.md — AI Working Agreement For Shot Chat

## Purpose

This file defines how AI agents should work in this project.

The goal is not to move fast at any cost. The goal is to make correct, maintainable, testable changes that preserve the current architecture and migration safety.

## Language

- Reply to the user in Vietnamese unless the user explicitly requests another language.
- Keep explanations concise, concrete, and tied to the current project state.
- Use English for code, file names, commands, environment variables, and test names.

## Source Of Truth For Session State

Before starting meaningful work, read these files if they exist:

1. `.agents/current-session.md`
   - Contains the overall roadmap, completed slices, pending slices, current runtime state, known risks, and constraints.

2. `.agents/next-session.md`
   - Contains the next approved slice to implement.

3. Relevant ADRs in `docs/adr/`
   - Especially for migrations, database design, API behavior, or architectural decisions.

Do not rely only on chat history when these files exist.

## Skill Policy

Use the global/user skill set from `~/.agents/skills` as the canonical skill set. Do not use old repo-local skills as the default workflow.

If the user explicitly invokes a skill, read that skill's `SKILL.md` and follow it for the current turn. If no skill is requested, select the most appropriate workflow below.

### Workflow Router

- Use `ask-matt` when unsure which workflow fits the request.
- Use `setup-matt-pocock-skills` only when the repo has not yet been configured for the engineering skills or expected issue/domain configuration is missing.

### Planning, Product, And Architecture

- Use `grill-with-docs` for architecture planning, migrations, database changes, API design, or unclear feature plans that need decisions recorded.
- Use `grilling` or `grill-me` when the user wants a plan stress-tested through questions before implementation.
- Use `domain-modeling` when the task changes or clarifies domain vocabulary, business concepts, or ubiquitous language.
- Use `codebase-design` when designing module seams, deep modules, interfaces, boundaries, or testable architecture.
- Use `improve-codebase-architecture` when scanning the codebase for architectural friction or refactoring opportunities.
- Use `prototype` when the best next step is throwaway code to answer a design, state-machine, business-logic, or UI direction question.

### Implementation And Validation

- Use `tdd` for feature implementation, bug fixes requiring regression coverage, or any request that asks for tests first.
- Use `diagnosing-bugs` for broken behavior, failing flows, crashes, exceptions, regressions, or performance issues.
- Use `code-check` for code review, audit, pre-merge review, or finding defects in existing changes.

### Issue And Delivery Workflow

- Use `to-prd` to synthesize the current conversation/context into a PRD.
- Use `to-issues` to split an approved plan/PRD into independently grabbable implementation issues.
- Use `triage` to classify, reproduce, sharpen, or prepare issues for implementation.
- Use `handoff` to compact durable progress, current state, constraints, and next steps for another session.

### Teaching And Skills

- Use `teach` when the user wants to learn a concept or skill over one or more sessions.
- Use `writing-great-skills` when creating or improving skills and their instructions.

### Google ADK Workflows

Use these only for Google ADK / agents-cli work:

- `google-agents-cli-workflow` for the full ADK development lifecycle.
- `google-agents-cli-scaffold` for creating/enhancing/upgrading ADK projects.
- `google-agents-cli-adk-code` for writing ADK agent code, tools, callbacks, orchestration, or state management.
- `google-agents-cli-eval` for evaluation datasets, eval runs, quality analysis, or optimization loops.
- `google-agents-cli-deploy` for Agent Runtime, Cloud Run, GKE, CI/CD, secrets, or deployment troubleshooting.
- `google-agents-cli-observability` for tracing, monitoring, logging, and production traffic debugging.
- `google-agents-cli-publish` for publishing/registering agents with Gemini Enterprise.

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
- Check relevant handoff/session/ADR docs.
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

- `.agents/current-session.md` for the full roadmap and slice statuses.
- `.agents/next-session.md` for the next approved slice only.
- `docs/adr/` for hard-to-reverse architectural decisions with real trade-offs.
- `CONTEXT.md` only for domain glossary terms, not implementation specs.

Keep docs concise. Do not copy entire conversations.

## Git And File Safety

- Do not commit unless the user explicitly asks.
- Do not create branches unless the user explicitly asks.
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



