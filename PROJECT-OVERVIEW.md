# KittaChat — Project Overview

## Product and Scope

KittaChat is a realtime communication application with direct and group messaging,
friendships, presence, shared files and avatars, and WebRTC audio/video calls.

## Architecture Direction

The client uses React and Vite. The backend uses Node.js, Express, Socket.IO and
Mongoose. MongoDB owns durable application data. Redis supports cache, presence,
fan-out and coordination. RabbitMQ handles background side effects. nginx fronts
the application; Docker Compose supports local operation and existing evidence workflows.

Detailed behavior, implementation constraints and decision rationale belong to the
architecture, standards, specifications and decision records linked from docs/README.md.

## Major Constraints

- Preserve authentication, authorization, privacy and secret-handling boundaries.
- Preserve public REST/Socket.IO contracts and conversation identifiers unless an
  explicitly approved change updates them.
- Keep durable data ownership and background-processing boundaries explicit.
- Treat migration, resource lifecycle and data-changing operations as bounded work
  with their existing approval and verification requirements.
- Distinguish implementation, automated checks, runtime verification, acceptance,
  merge and deployment; evidence for one does not establish another.

## Development Workflow

Use GitHub Issues in NhiBuaa/kitta-chat for task scope, approval amendments and
progress. Use Pull Requests for implementation discussion, review and CI evidence.
AGENTS.md routes contributors to relevant guidance. CONTEXT.md gives a bounded,
dated project orientation, without becoming a task ledger.

## Current Foundation

The repository contains the application, automated checks, local runtime tooling,
architecture decisions and retained verification evidence. Feature-specific readiness
must be established from its current Issue/PR and the relevant implementation.

## Open Questions

- Current K6 acceptance and deployment readiness require their own live evidence.
- Existing migration-era descriptions must be reconciled with their owning sources
  before being promoted into present-tense claims.
