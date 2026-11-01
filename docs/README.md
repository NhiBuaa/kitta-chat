# Documentation Map

[PROJECT-OVERVIEW.md](../PROJECT-OVERVIEW.md) owns the project foundation.
[CONTEXT.md](../CONTEXT.md) gives dated orientation; [AGENTS.md](../AGENTS.md) routes
agent work. Numbering organizes discovery, not precedence between sources.

| Area | Read for |
|---|---|
| [01-overview](01-overview/README.md) | Stable orientation and navigation |
| [02-architecture](02-architecture/README.md) | Components, ownership and data flows |
| [03-product](03-product/README.md) | Domain vocabulary and product concepts |
| [04-standards](04-standards/README.md) | Rules human and agent implementations must obey |
| [05-specs](05-specs/README.md) | Required behavior and contracts |
| [06-decisions](06-decisions/README.md) | Accepted decisions and their rationale |
| [07-guides](07-guides/README.md) | Normal development and operational procedures |
| [08-runbooks](08-runbooks/README.md) | Recovery and incident procedures |
| [99-notes](99-notes/README.md) | Optional non-authoritative retained knowledge |

## Ownership And Compatibility

Each durable fact has one owner; indexes link to it rather than copying its content.
Architecture docs at the root of `docs/`, `docs/adr/`, `specs/` and observability resources
remain at established paths. The numbered indexes expose these owners without a mass
rename. Assets and machine-read JSON/YAML also retain their existing paths.

Historical review/evidence packages in `docs/reviews/`, `docs/security/`,
[K4 evidence](k4-performance-evidence.md) and [.agents/](../.agents/README.md) remain
retained records. They do not establish current runtime state or authorize replay.
`docs/security/` contains policy, research and evidence: use the
[security standard](04-standards/security-findings.md) and owning Issue/ADR to determine
authority; the folder itself does not confer accepted status on every document.

Use Issues for scope/plans/progress and PRs for implementation/review/CI/verification.
Do not populate empty categories with duplicate project prose or task logs.
