# Manual Test Guide: K6 Issue #116 — Demo Seed and Reset Boundary

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #116
- Specification: .agents/manual-tests/k6-public-demo/issue-116-spec-snapshot.md
- Specification SHA-256: 8d73c59a15d24d4938538a81edf596f5c215892c7d8a77df0f6e77809aa5f452
- Ticket review: .agents/manual-tests/k6-public-demo/issue-116-ticket-review.json
- Ticket review SHA-256: 97d435297f26a6ab519309b3a25c7503637256749c224b1b3060d0c5e598f12e
- Source base: 79a2653464d0bf798b95222ec7434ce8722a696b
- Branch: nhibuaa/k6-issue-116-demo-seed
- Worktree: D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-116
- Guide revision: k6-116-demo-seed-v1
- Lock status: candidate until external guide review and maintainer approval
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v1.evaluations.jsonl

## Authorization boundary

Use injected/in-memory repositories for destructive fault matrices and one unique disposable local
Mongo container for end-to-end seed/reset. Do not contact Atlas, Railway, S3, Redis, RabbitMQ, or
another provider. Do not create a runtime credential or run a remote seed/reset.

Use a random synthetic password supplied only through the candidate process environment. Do not
print or retain it. Required result: D2_MUTATIONS=0. This guide is not a per-Issue code review.

## Candidate and disposable target

Require the exact worktree, branch, and SourceBase ancestry, derive CandidateTree from the staged
Git index with scripts/k6/issue111_candidate.py, and materialize that tree under OS temp. The later
execution approval binds this guide SHA-256 and CandidateTree.

Start a uniquely named cached mongo:7.0 container with a random loopback port and no persistent host
volume. Record only the image digest, random container label digest, healthy boolean, and empty
initial collection counts. Keep the local URI and synthetic password in process memory/environment,
not output/evidence. Abort if the image is unavailable rather than pulling.

npm run k6:demo-seed:acceptance -- --output <temp-output> receives the local URI by environment,
uses fixed clocks, and writes only: canonical-manifest.json, target-guard.json, collisions.json,
ownership-plan.json, dry-run-apply.json, partial-failure.json, startup-scan.json, and
evidence-manifest.json. Only approved catalog cardinalities, stable non-secret digest, structural
case labels, bounded per-collection counts, command exits, cleanup booleans, and D2_MUTATIONS=0 may
be retained. No password/hash, URI/host, unapproved email, Mongo ID, message/profile content, or
personal field may appear.

## Locked Test Cases

### MA-116-01: Canonical dataset and credential boundary

- Require exact catalog counts: 19 users, 6 groups, 60 files, 244 messages, 24 conversations, and
  60 participants, with stable public/legacy IDs, request/idempotency keys, timestamps, and digest.
- Rebuild twice and require byte-equivalent non-secret manifests; password hashes are excluded while
  the process-only password authenticates every seeded account.
- Missing/blank password must fail before target parsing, connection, or model access; no default
  credential/hash/export may exist.

### MA-116-02: Fail-before-connect target attestation

- Exercise local approved host/database plus malformed URI, missing/wrong database, arbitrary
  remote, local/remote mode mismatch, production-like target, missing/mismatched fingerprint, and
  operator-label-only attempts.
- Exercise remote contract only through pure parsing/fingerprint fixtures; do not connect.
- Require remote seed to need every locked authority and remote reset additionally to need the
  separate destructive confirmation. Every rejection has zero connect/model calls and value-free
  errors.

### MA-116-03: Reserved identity collision and zero-write preflight

- Seed the empty disposable target, then rerun unchanged.
- With injected repositories, test expected email/ID/seeded marker reuse and every mismatch:
  unmarked/self-signup/foreign marker, wrong ID, expected ID bound elsewhere, and duplicate email.
- Require all collision checks before writes; any mismatch produces zero writes and never adopts or
  rotates a foreign account.

### MA-116-04: Complete structural ownership closure

- Cover User, Group, File, Message, Conversation, ConversationParticipant, CallHistory, friends,
  and friend-request references using seeded, self-signup, wrong-version, unmarked, mixed,
  inconsistent legacy identity, S3-backed File, and foreign-reference fixtures.
- Require .test alone to grant no ownership. Every mixed/S3-backed/foreign case yields uncertain
  greater than zero, blocks apply before writes, and performs no foreign-User repair.
- Explicitly observed personal/sensitive content is an operator-escalation label only; verify no
  PII/content classifier is introduced.

### MA-116-05: Dry-run/apply parity and bounded empty end state

- On the disposable target, seed once, run default dry-run, then exact apply.
- Require the same candidate-manifest digest and selectors, zero dry-run mutations, no apply item
  outside the manifest, and only bounded candidate/deleted/referenceRepairs/skipped/uncertain/failed
  counts.
- Require an empty K6-owned Mongo namespace after apply; a second apply is a no-op. Reseed remains a
  separate explicit command.

### MA-116-06: Partial failure and safe rerun

- With injected repositories, fail each ordered collection stage and reference stage once.
- Require non-zero exit, no false completion, bounded completed-stage counts, and no selector
  broadening. Rerun from every partial state and require convergence without double-counting.
- Any uncertainty discovered before apply must cause zero writes across all models.

### MA-116-07: Startup and public-contract isolation

- Scan/import backend, image-worker, audit-worker, and notification-worker entrypoints and start
  each with test-owned adapters.
- Require no seed/reset import or invocation, no startup seed/reset flag, and separate explicit
  operator commands only.
- Verify ownership markers remain internal and existing public API/Socket.IO payload shapes contain
  no marker/version/kind field.

### MA-116-08: Full candidate gate, secret scan, and cleanup

Run from the materialized candidate:

~~~powershell
npm run test:k6-demo-seed
npm run test:ci
npm run ci:validate
npm run lint:ci
npm --prefix client test
npm --prefix client run build
npm --prefix server test
docker build --pull=false --target prod --tag kittachat-k6-116-server:local ./server
docker build --pull=false --build-arg VITE_TARGET=public-demo --tag kittachat-k6-116-edge:local --file ./nginx/Dockerfile .
~~~

Require source-base-to-CandidateTree diff check and pinned cached Gitleaks against candidate
diff/manifest. Stop and remove only the unique guide-created disposable Mongo container; verify it
is absent and no volume exists. Require zero external provider requests, zero remote mutations,
clean temporary processes/ports, and D2_MUTATIONS=0.

## Evaluation procedure

Append FAILED/pending for failure or BLOCKED/pending when a required case cannot run, with NOT_RUN
after the first terminal case. When all eight pass, append schema-v2 BLOCKED/pending with
scripts/record_evaluation.py bound to this guide/revision, SourceBase, and CandidateTree.

Stop for maintainer acceptance of the exact run. PASSED/approved requires a new acceptance sidecar
and byte-identical observations. Preserve all history. A semantic guide change requires v2.

## Cleanup safety

Before removing the disposable container, verify its exact random guide-owned name/label and that it
uses no persistent volume. Removal authority applies only to that ephemeral test object. Delete only
unique OS-temp candidate/output paths. Keep sanitized artifacts and append-only Evaluation.
