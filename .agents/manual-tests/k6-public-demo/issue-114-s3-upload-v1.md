# Manual Test Guide: K6 Issue #114 — Private S3 Upload Boundary

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #114
- Specification: .agents/manual-tests/k6-public-demo/issue-114-spec-snapshot.md
- Specification SHA-256: 6710e05afb678cd15e36cdb9e7e97754e0dbdf373c66ff71a4eccb07c8e2f3cb
- Ticket review: .agents/manual-tests/k6-public-demo/issue-114-ticket-review.json
- Ticket review SHA-256: 5d9317e5291cb17a8012466dd76839ad7179b335f81eb56573944454b82bbc49
- Source base: 79a2653464d0bf798b95222ec7434ce8722a696b
- Branch: nhibuaa/k6-issue-114-s3-upload
- Worktree: D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114
- Guide revision: k6-114-s3-upload-v1
- Lock status: candidate until external guide review and maintainer approval
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v1.evaluations.jsonl

## Authorization boundary

Execute only against the staged Git-index candidate using injected Mongo/storage/queue/emitter
adapters. Do not configure an AWS credential, resolve an AWS endpoint, call S3, edit bucket CORS,
bind Railway, publish GHCR, deploy, or retain a presigned URL/key/provider response.

Required result: D2_MUTATIONS=0. This guide is not a per-Issue code review.

## Candidate identity

From the exact worktree, require the expected branch and source-base ancestry. Stage only Issue #114
source, tests, scripts, and this immutable evidence package. Then run:

~~~powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne 'nhibuaa/k6-issue-114-s3-upload') { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
$Candidate = python scripts/k6/issue111_candidate.py --repository . --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = $Candidate.execution_tree
~~~

The later execution approval must bind this guide SHA-256 and exact $CandidateTree. Materialize
that tree into a unique OS-temp directory. Run npm ci there only when dependencies are absent.
No command may read the source worktree's untracked files or environment secrets.

## Required scenario artifacts

npm run k6:s3:acceptance -- --output <temp-output> must execute with fake storage, fake Mongo
repositories, fake queue/emitter, fixed clock/UUIDs, and outbound network denied. It writes only:

- key-policy.json: case IDs, accepted key class, rejection class, and pre-SDK call count;
- upload-envelope.json: MIME/size/part/ETag case IDs and bounded outcome codes;
- multipart-lifecycle.json: synthetic owner labels, states, provider-call counts, and replay flags;
- private-projections.json: projection IDs, authorization/signing booleans, output-shape digests,
  signed-URL lifetime number, and raw-provider-URL count;
- worker-ownership.json: job class, read/write/delete counts, current-attempt proof, event-shape
  digest, and race disposition;
- activation-errors.json: capability-state pairs, HTTP status/code pairs, side-effect counts,
  and redaction assertions;
- contract-oracle.json: source-base/candidate success-shape digests and exact-match booleans;
- evidence-manifest.json: command exits, artifact digests, changed-file inventory,
  externalProviderRequestCount=0, providerMutationCount=0, and D2_MUTATIONS=0.

Files must not contain object keys, upload IDs, URL query strings, AWS hostnames, provider text,
credentials, raw user/database IDs, or request payload content. Synthetic labels and digests only.

## Locked Test Cases

### MA-114-01: Object-key policy and pre-SDK rejection

- Run every approved staging/durable key generator with fixed synthetic owner/request inputs.
- Run empty segments, dot segments, slash/backslash and encoded traversal, absolute URL, userinfo,
  control character, prefix-confusion, and outside-prefix cases.
- Require exactly the four locked classes, no queue-sources prefix, and zero storage/queue calls for
  every rejected case.

### MA-114-02: Exact upload envelope and part bounds

- Run every allowed MIME at max-1, max, and max+1 bytes; run blank, wildcard, unsupported, and
  application/octet-stream.
- Exercise one through ten 5-MiB parts, valid final-part bounds, zero/duplicate/skipped/unordered/
  excessive parts, invalid/missing ETags, and declared-size mismatch.
- Require no provider operation for invalid cases and the exact INVALID_UPLOAD_REQUEST result.

### MA-114-03: Principal-bound multipart lifecycle

- With injected persistent session storage, run owner initiate/sign/complete, controller reload,
  completed replay, internal abort, expiry, foreign principal, and key/upload-ID substitution.
- Require the stored owner/metadata/state to be authority; foreign/missing is
  UPLOAD_SESSION_NOT_FOUND, inactive is UPLOAD_SESSION_NOT_ACTIVE, and rejected paths make no
  provider call.
- Completed replay must return the same File through the existing shape.

### MA-114-04: Private delivery and projection completeness

- Run authorized and denied document download plus every locked attachment/avatar REST/Socket.IO
  projection.
- Require a fresh 300-second signed GET only after authorization, unchanged field/event names,
  same-origin demo-local assets, and no raw stored/provider URL.
- Signing failure must expose only the safe failure/placeholder contract.

### MA-114-05: Worker ownership, idempotency, and races

- Exercise chat/avatar staging, forged jobs, unsupported source class, duplicate request ID, insert
  race, processing error, and cleanup error with native Sharp fixtures and fake storage.
- Require approved output classes, existing fileProcessed/avatarUpdated shapes, and deletion only
  of validated current-attempt staging/output. A durable prior output is never deleted.

### MA-114-06: Fault cleanup and secret-safe errors

- Inject failure before completion, after S3 completion/before File ownership, queue publication,
  output persistence, and cleanup.
- Require one owned abort/delete at the correct boundary and no outside-manifest cleanup.
- Assert every status/code row and scan captured errors/logs for zero provider text, key, upload ID,
  URL query, credential, or stack.

### MA-114-07: Fail-closed activation and public-contract preservation

- Verify checked-in backend/edge/runtime fixtures remain disabled/false.
- Exercise validated/true only in source-level fixtures and reject every missing/malformed/
  mismatched pair. Disabled routes must stop before parser, limiter, queue, Mongo, or storage.
- Compare source-base and candidate success response/event fields. Only public-demo init fileSize
  may be added to the request.

### MA-114-08: Full candidate gate and pre-D2 invariant

Run from the materialized candidate:

~~~powershell
npm run test:k6-s3-upload
npm run test:ci
npm run ci:validate
npm run lint:ci
npm --prefix client test
npm --prefix client run build
npm --prefix server test
docker build --pull=false --target prod --tag kittachat-k6-114-server:local ./server
docker build --pull=false --build-arg VITE_TARGET=public-demo --tag kittachat-k6-114-edge:local --file ./nginx/Dockerfile .
~~~

Also require git diff --check from $SourceBase to $CandidateTree, pinned cached Gitleaks against the
candidate diff and retained manifest, no external socket/DNS/AWS request in the scenario harness,
all temporary processes/ports released, and D2_MUTATIONS=0.

## Evaluation procedure

If any case fails, append FAILED/pending; if a required case cannot run, append BLOCKED/pending;
use NOT_RUN after the first terminal case. If all eight observations pass, append one schema-v2
BLOCKED/pending observation with scripts/record_evaluation.py, the guide path/revision above,
$SourceBase, and $CandidateTree.

Stop for maintainer acceptance of that exact run. A later PASSED/approved append must use a new
acceptance sidecar bound to the same guide hash, source base, candidate tree, pending run, and
byte-identical eight observations. Never edit or delete Evaluation history.

## Cleanup

Require scenario cleanup counters and listening ports to be zero. Delete only unique candidate,
diff, and output paths proven to be inside the OS temp directory. Keep the guide, sanitized
scenario artifacts, manifest, and append-only Evaluation. A semantic guide change requires v2.
