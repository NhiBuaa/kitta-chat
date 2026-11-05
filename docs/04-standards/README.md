# Implementation Standards

These rules apply to human and agent implementations alike. Agent-only workflow lives
in the [working agreement](../../.agents/rules/working-agreement.md) and [UI skill routing](../../.agents/rules/ui-skill-routing.md).

- [Data ownership](data-ownership.md): MongoDB, Redis, RabbitMQ and workers.
- [Conversation identity](conversation-identity.md): public/internal IDs and rooms.
- [Read-model migration](conversation-read-model-migration.md): flags, backfill and read switches.
- [Realtime state](realtime-state.md): presence, typing and listener cleanup.
- [Auth sessions](auth-session.md): memory tokens, cookies and credentials.
- [Security finding disposition](security-findings.md): findings, origins, rate limits and approvals.
- [Calls](calls.md): lifecycle, access and call-log idempotency.
- [UI/UX quality](ui-quality.md): context-aware hierarchy, 4-stage lifecycle, design tokens and accessibility.
- [CI policy](../CI_POLICY.md): checks, trust and enforcement; its established path is retained.

The migrated standards retain their prior policy content. Historical slice/approval
wording does not grant current authority. For migration-era conflicts, follow the explicit
warning in [CONTEXT.md](../../CONTEXT.md#important-transitions-and-limitations) and resolve
the affected contract through its owning ADR/Issue before changing behavior.

When an approved decision changes a rule, update its owner here and the relevant ADR or
[decision log](../decisions.md). Old `.agents/rules/` paths are compatibility pointers only.
