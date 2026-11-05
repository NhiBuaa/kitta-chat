---
status: current
last_verified: 2026-11-05
has_ui_surface: true
---

# Current Project Context

## Boundary & Surface

KittaChat contains direct/group messaging, friendships, presence, file/avatar sharing,
and WebRTC audio/video calls.
- **Has UI Surface:** True (React 19 + Tailwind CSS v4 web client in `client/`).
- **Foundation:** [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md).
- **Design System:** [DESIGN.md](DESIGN.md).
- **Documentation Map:** [docs/README.md](docs/README.md).

## Current State

Repository source/configuration and existing documentation establish a React/Vite client,
Node.js/Express/Socket.IO backend, MongoDB durable data, Redis cache/coordination,
RabbitMQ background workers, nginx and local Docker Compose tooling.
The repository has automated checks, architectural decisions and retained verification
records. Their presence does not establish fresh runtime acceptance or deployment.

## Active Direction

Use the relevant [GitHub Issues](https://github.com/NhiBuaa/kitta-chat/issues) and PRs,
including latest approval amendments, to determine active work. This file provides
orientation rather than reproducing task status or granting implementation authority.

## Important Transitions And Limitations

- Documentation now separates foundation, orientation, glossary, software standards
  and agent-only instructions. Older entry paths remain compatibility pointers.
- UI implementations are governed by root [DESIGN.md](DESIGN.md), [docs/04-standards/ui-quality.md](docs/04-standards/ui-quality.md), and [.agents/rules/ui-skill-routing.md](.agents/rules/ui-skill-routing.md).
- Migration-era statements in the glossary, standards and older specs coexist with
  [ADR-006](docs/adr/006-unified-sidebar-conversations.md), which describes a unified
  read-model sidebar. Before changing read authority, flags or identity behavior,
  reconcile the exact path with the owning decision, live Issue/PR and code/tests.
  This documentation migration preserves the existing standards and does not decide
  a new runtime policy or resolve that historical wording conflict.
- Current K6 acceptance, provider configuration and deployment readiness require their
  own evidence. This structural setup did not run the application or access providers.
- Some durable docs remain at established paths and are indexed by numbered categories.
  Historical evidence remains at its original paths; see [retained material](.agents/README.md).

## Canonical References

- Project foundation: [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md).
- Design system: [DESIGN.md](DESIGN.md).
- Agent entrypoint: [AGENTS.md](AGENTS.md).
- Vocabulary: [glossary](docs/03-product/glossary.md).
- Implementation rules: [standards](docs/04-standards/README.md).
- Decisions: [ADR index](docs/adr/README.md).
- Work ownership and closeout: [Issue tracker](docs/agents/issue-tracker.md).
