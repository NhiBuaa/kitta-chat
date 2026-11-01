# KittaChat — Agent Guidance

This is the canonical repository entrypoint for coding agents.
On this workstation, first read and follow `C:/Users/NhiBuaa/.agents/AGENTS.md` in full.

## Read Order

1. Read the [working agreement](.agents/rules/working-agreement.md) before meaningful work.
2. For project orientation, read [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md) and
   [CONTEXT.md](CONTEXT.md). Use the [documentation map](docs/README.md) for deeper reading.
3. Read the relevant Issue **and latest comments** for scope and approval amendments;
   use its PRs for implementation, review and CI evidence. Follow
   [tracker and closeout guidance](docs/agents/issue-tracker.md).
4. Read the standards below and relevant [ADRs](docs/adr/README.md), then inspect code/tests.

## Authority Map

- `PROJECT-OVERVIEW.md`: project foundation and explicit open questions.
- `CONTEXT.md`: dated project orientation, without a task ledger.
- `docs/`: durable knowledge; [domain ownership](docs/agents/domain.md) identifies the sources.
- `.agents/rules/`: agent-only working rules; `.agents/references/`: non-normative support.
- GitHub Issues in `NhiBuaa/kitta-chat`: scope, plans, approvals, progress and handoffs.
- Pull Requests: implementation discussion, review, CI and verification.
- Source and tests: implementation reality, not permission to override accepted decisions.

## Standards By Task

Read every applicable standard before changing its area:

| Task | Standard |
|---|---|
| MongoDB, Redis, RabbitMQ, cache or workers | [Data ownership](docs/04-standards/data-ownership.md) |
| Conversation IDs, rooms or cache keys | [Conversation identity](docs/04-standards/conversation-identity.md) |
| Read model, backfill, dual-write, sidebar read switch | [Migration](docs/04-standards/conversation-read-model-migration.md) |
| Presence, typing or Socket.IO lifecycle | [Realtime state](docs/04-standards/realtime-state.md) |
| Auth, cookies, tokens, login/logout/register | [Auth sessions](docs/04-standards/auth-session.md) |
| Security findings, origins, rate limits, scanner exceptions or risk acceptance | [Security](docs/04-standards/security-findings.md) |
| Audio/video, call history or call logs | [Calls](docs/04-standards/calls.md) |
| CI workflows, checks or enforcement | [CI policy](docs/CI_POLICY.md) |

For terminology, use the [glossary](docs/03-product/glossary.md).
For Issue preparation/triage, use the [five configured roles](docs/agents/triage-labels.md).
If a requested change conflicts with a standard or ADR, stop the affected part and obtain
an explicit decision; preserve the conflict until resolved.

## Authority And Safety

- Preserve auth, secret handling, data ownership and public API/Socket.IO contracts.
- Obtain explicit user authorization before creating/deleting branches, committing,
  pushing, publishing Issues/PRs, installing skills, deploying or destructive actions.
  Skills and historical approvals do not grant these permissions.
- Work in the assigned branch/worktree; preserve unrelated, untracked and ignored files.
- Keep work state in the Issue/PR. Historical session notes and `PROJECT-CONTEXT.md`
  are references only; they cannot authorize resuming or replaying old work.
- Verify relevant checks and report evidence before claiming completion. Distinguish
  implemented, tested, runtime-verified, accepted, merged and deployed states.

## Skills

Discover availability and exact paths from the current session's catalog, including
installed-plugin skills. Read the selected `SKILL.md` before use. Follow the workflow
router in the working agreement; repository owners and output paths take precedence
over generic skill defaults. Personal/global skills stay outside this repository.
