# Immutable Review Snapshot: GitHub Issue #116

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#116`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/116
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Source base: `79a2653464d0bf798b95222ec7434ce8722a696b`
- Captured at: `2026-08-23`
- Purpose: immutable Spec input for Test Cases, the manual guide, TDD, and the later single whole-K6 review

## Title

K6-06 — Demo seed/reset operating boundary

## Body

### Parent

#110

### What to build

Deliver deterministic, idempotent and explicitly invoked demo seed/reset operations for synthetic
`.test` accounts and demo conversations. Operations must be guarded against non-demo targets,
never run at startup, and mutate only records proven to be owned by the K6 demo namespace.

This ticket does not run a remote seed/reset, create a live credential, mutate Railway/provider
data, or delete an S3 object.

### Locked demo ownership and retention policy

K6 uses an internal, non-public ownership marker with namespace `kittachat-demo`, version `1`, and
kind `seeded` or `self-signup`. Public API and Socket.IO payload shapes do not expose the marker.
The public-demo registration path sets `self-signup` only after the #113 synthetic `.test` boundary
passes. The deterministic seed writes `seeded` on every seed-owned record it creates.

Seeded and self-signup accounts are ephemeral demo data and are eligible for a full K6 reset only
when ownership is proven by the marker plus the `.test` identity boundary. A `.test` suffix alone
is never deletion authority. Unmarked, wrong-version, non-`.test`, personal, sensitive, or
production-like records are never adopted or deleted.

The ownership planner covers `User`, `Group`, `File`, `Message`, `Conversation`,
`ConversationParticipant`, and `CallHistory`, plus `User.friends` and friend-request references.
Runtime-created records are resettable only when every owner/actor/participant resolves to an
owned K6 demo user and their legacy conversation identity is consistent. A mixed group,
conversation, call, file/message ownership chain, or foreign reference is `uncertain`; apply aborts
before mutation and reports only bounded counts. It never guesses ownership.

#116 is Mongo-only fixture cleanup. `demo-local/*` File records may be removed from Mongo when
otherwise owned. Any S3-backed File/object makes the reset plan `uncertain` until the separate
#114/D2 storage cleanup procedure has disposed it; #116 never invokes S3. This keeps #114 out of the
pre-D2 blocker graph while preserving the live ordering boundary.

### Locked deterministic seed and collision policy

The canonical catalog remains bounded at 19 users, 6 groups, 60 files, 244 messages, 24
conversations, and 60 participants unless a separately reviewed manifest revision changes it.
Stable public IDs, legacy conversation IDs, request IDs, idempotency keys, timestamps, and
collection counts are deterministic. Credential-dependent password hashes are excluded from the
canonical content digest, while every account must authenticate with the operator-supplied demo
password.

The exact seed email catalog is reserved by identity. Before any write, the seed performs a full
collision scan. An existing reserved email is reusable only when its deterministic expected User ID
and ownership marker also match. A mismatched ID, missing/foreign marker, expected ID bound to a
different email, or other ambiguous collision aborts with zero writes. The operation never adopts
or overwrites a pre-existing self-signup/unmarked account.

`DEMO_SEED_PASSWORD` is required through the one-off operator environment, never defaulted,
committed, echoed, logged, or retained in evidence. Missing/blank input fails before connection or
model access.

### Locked target attestation and authorities

Target checks run before Mongo connection.

- Local mode requires explicit `K6_DEMO_TARGET_MODE=local`, a host in the existing local allowlist,
  and database exactly `shot-chat`. It never accepts remote authority.
- Remote mode requires `K6_DEMO_TARGET_MODE=public-demo`, `K6_TARGET=public-demo`,
  `ALLOW_REMOTE_DEMO_SEED=true`, database exactly `shot-chat`, and a non-secret expected target
  fingerprint supplied from the approved D2 Atlas binding. The script derives SHA-256 from the
  normalized Mongo scheme/host/database with credentials and query removed and requires exact
  equality before connect. The expected fingerprint is separate from the URI; an operator label
  alone cannot approve an arbitrary host.
- Remote reset write mode additionally requires `ALLOW_REMOTE_DEMO_RESET=true` and exact destructive
  confirmation `RESET_KITTACHAT_PUBLIC_DEMO`. Seed authority alone cannot authorize reset.

Malformed URI, missing/wrong database, local/remote mode mismatch, production-like/unknown target,
missing fingerprint, or mismatch fails before connect and never prints URI userinfo/host detail.
Fingerprint creation/read-back and remote execution remain D2-only.

### Locked reset lifecycle

Reset terminal state is an empty K6-owned Mongo namespace; reseeding is a separate explicit seed
command. Dry-run is the default. Mutation requires exact `--apply` plus the target authorities
above. Dry-run and apply consume the same deterministic candidate manifest and per-collection
selectors. Apply may not delete or update an item absent from that manifest.

The planner reports per collection only `candidate`, `deleted`, `referenceRepairs`, `skipped`,
`uncertain`, and `failed` counts. Public/retained evidence contains no Mongo ID, email beyond the
approved fixed seed catalog, URI, credential, or personal field. Any `uncertain` item blocks apply
before writes.

Apply is ordered and safely rerunnable. A failure returns non-zero, never reports completion, and
records which collection stages completed using counts only. A rerun recomputes ownership and
converges without broadening selectors or double-counting. A second successful reset is a no-op.
Any friends or friend-request reference from an unowned User makes the plan uncertain; apply
rejects with zero writes and performs no foreign-User repair. Every mixed reference blocks.

Seed/reset are separate package/operator commands and are not imported or invoked by backend,
image-worker, audit-worker, or notification-worker startup.

### Acceptance criteria

- [ ] The canonical catalog and non-secret digest are deterministic; repeated seed produces no
  duplicate or uncontrolled growth and preserves legacy conversation identity.
- [ ] Missing credentials and every invalid target fail before connection without value disclosure.
- [ ] Local and D2-bound remote modes satisfy the exact attestation contract; reset uses separate
  destructive authority.
- [ ] Reserved seed-email/ID/marker collisions abort with zero writes; only demonstrably seed-owned
  records are reused.
- [ ] The ownership planner covers every named collection/reference. Any reference from an unowned
  User yields uncertain greater than zero, rejects apply, and causes zero model mutations.
- [ ] Automated ownership uses structural markers/relations only. Explicitly observed personal or
  sensitive content becomes uncertain and requires operator escalation; #116 adds no PII/content
  classifier.
- [ ] Dry-run is mutation-free and byte-equivalent in candidate selection to apply on the same
  fixture; apply is bounded, idempotent, partial-failure-visible, and safely rerunnable.
- [ ] Reset ends with the empty owned namespace; reseed is explicit; no startup path can invoke
  either command.
- [ ] Automated/manual pre-D2 tests use only injected, in-memory, or explicitly local Mongo seams
  and record `D2_MUTATIONS=0`.

### Retained risks and boundaries

Actual Atlas fingerprint read-back, Railway secret-safe command execution, remote seed, post-seed
acceptance, and any live reset remain post-approval D2 actions. #116 never contacts S3, Redis,
RabbitMQ, Atlas, Railway, or another provider pre-D2.

### Blocked by

- #113
