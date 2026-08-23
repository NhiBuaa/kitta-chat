# Manual Test Guide: K6 Issue #115 — WebRTC ICE and Media Readiness

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #115
- Specification: .agents/manual-tests/k6-public-demo/issue-115-spec-snapshot.md
- Specification SHA-256: e10bd1d270927973e0bbfa749586cc50a9cfecf0f75b9e54c0e177327ac6771f
- Ticket review: .agents/manual-tests/k6-public-demo/issue-115-ticket-review.json
- Ticket review SHA-256: 3f5f2a7cb50026b408bf0145dcd71807b27791c046b3bb74daacd9284ea5303f
- Source base: 79a2653464d0bf798b95222ec7434ce8722a696b
- Branch: nhibuaa/k6-issue-115-webrtc-ice
- Worktree: D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-115
- Guide revision: k6-115-webrtc-ice-v1
- Lock status: candidate until external guide review and maintainer approval
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v1.evaluations.jsonl

## Authorization boundary

Use only the staged local candidate, test-owned loopback signaling, two synthetic authenticated
principal fixtures, and browser-generated synthetic media. Do not provision TURN, call a TURN
credential service, bind provider values, deploy, publish, or claim the public network matrix passes.

Required result: D2_MUTATIONS=0. Readiness here is fixture/evidence state only and is not a product
call state. This guide is not a per-Issue code review.

## Candidate identity and local fixture

Require the exact worktree, branch, and source-base ancestry, then derive CandidateTree using
scripts/k6/issue111_candidate.py from the staged Git index. The later execution approval must bind
the exact guide SHA-256 and CandidateTree. Materialize that tree under a unique OS-temp directory.

npm run k6:webrtc:acceptance -- --output <temp-output> starts one loopback-only fixture process on a
random port. It must:

- use the actual runtime-config parser/store and the same injected peer factory consumed by caller,
  answerer, glare-winner, and glare-loser paths;
- expose two isolated synthetic principal contexts, Alice.test and Bob.test, with memory-only
  fixture auth and no reusable credential;
- use the unchanged call event/payload adapter and synthetic audio/video tracks;
- deny non-loopback network except the two approved public STUN URLs during the real-browser case;
- use fake peers/stats and no external network for deterministic classifier/failure cases;
- terminate all peers, tracks, timers, listeners, browser pages, and the fixture process.

The fixture writes sanitized artifacts only: runtime-ice.json, peer-paths.json,
media-classifier.json, lifecycle-cleanup.json, product-contract.json, local-browser.json,
artifact-scan.json, and evidence-manifest.json. Retain fixed case/classification labels, counts,
booleans, elapsed/sample counts, contract digests, and D2_MUTATIONS=0. Do not retain raw SDP,
candidate strings, IPs, device labels, media bytes, tokens, credentials, provider errors, or
Socket.IO/resource identifiers.

## Locked Test Cases

### MA-115-01: Runtime ICE schema and calls cross-field policy

- Exercise one through four entries and one through eight unique STUN/STUNS URLs, scalar/array URLs,
  normalization, valid ports, and the exact initial two-STUN candidate.
- Reject calls-enabled empty metadata, calls-disabled non-empty metadata, duplicates, oversized
  entries/URLs, whitespace, userinfo, path, fragment, query, unsafe port, unsupported scheme, and
  every credential field.
- Require the existing fail-closed runtime-config state and zero peer construction on rejection.

### MA-115-02: Every peer path uses one immutable runtime snapshot

- Exercise outgoing caller, normal answerer, glare winner, and glare loser with an inspectable fake
  Peer constructor.
- Require each public-demo path to receive an immutable clone of the same validated snapshot, no
  import/fallback to the hard-coded constant, and no peer when calls are false.
- Require legacy-local to retain exactly the two existing STUN URLs.

### MA-115-03: Credential and retained-evidence safety

- Inject synthetic username, credential, credentialType, token, userinfo, query, SDP, candidate, IP,
  and device-label sentinels at every rejected configuration/fixture-output seam.
- Build the K6 frontend and scan source diff, dist, runtime-config, fixture output, logs, and
  evidence manifest.
- Require rejection and zero sentinel/prohibited field occurrence. No new call-config REST/Socket.IO
  route/event or backend/TURN binding may exist.

### MA-115-04: Objective audio/video readiness

- With fake clock and stats, run offer/answer only, ICE only, remote-stream only, outbound-only,
  one-way inbound, bidirectional audio, and bidirectional audio-plus-video.
- Require ready only when both peers have ICE connected/completed and two samples at least 500 ms
  apart show increasing inbound RTP bytes for every required kind.
- Require audio calls to prove two-way audio and video calls to prove two-way audio and video.

### MA-115-05: Bounded failure, cancellation, and race cleanup

- Run ICE failed, disconnected recovery inside/outside 5 seconds, 20-second deadline, partial media,
  peer replacement, call end, explicit cancellation, repeated events, and late samples.
- Require exactly one of ready, signaling_only, ice_failed, media_timeout, or cancelled.
- Require timers/listeners/tracks/peers to clean exactly once and no post-terminal transition.

### MA-115-06: Product signaling/API/history preservation

- Run source-base and candidate oracles for outgoing, answer, reject, timeout, glare winner/loser,
  end call, participant-only history, answeredAt/duration, and call-log uniqueness.
- Require exact event names, payload/ACK keys, room/authorization classes, REST shapes, CallHistory
  status/timestamp semantics, call-log behavior, and product CALL_STATES behavior.
- The fixture classifier must not write product state, Mongo, Redis, RabbitMQ, or a call history.

### MA-115-07: Real local browser media fixture

- In a browser with synthetic media permission, run Alice.test and Bob.test through the loopback
  fixture for one audio and one video call; then run signaling with inbound progress withheld.
- Require audio and video to classify ready under the exact oracle, the withheld case to classify
  signaling_only/media_timeout, and all contexts to return idle with product-contract digests
  unchanged.
- Record only sanitized classifications and counts. Local success is not deployed readiness.

### MA-115-08: Full candidate gate and pre-D2 invariant

Run from the materialized candidate:

~~~powershell
npm run test:k6-webrtc-ice
npm run test:ci
npm run ci:validate
npm run lint:ci
npm --prefix client test
npm --prefix client run build
npm --prefix server test
docker build --pull=false --target prod --tag kittachat-k6-115-server:local ./server
docker build --pull=false --build-arg VITE_TARGET=public-demo --tag kittachat-k6-115-edge:local --file ./nginx/Dockerfile .
~~~

Also require the source-base-to-CandidateTree diff check, pinned cached Gitleaks against candidate
diff/dist/manifest, the exact process/port/peer/track cleanup counters, no TURN/provider credential
path, no retained prohibited data, and D2_MUTATIONS=0.

## Evaluation procedure

Append FAILED/pending for a failed case or BLOCKED/pending for a case that cannot run, with NOT_RUN
after the first terminal case. If all eight observations pass, append schema-v2 BLOCKED/pending
through scripts/record_evaluation.py using this guide/revision, SourceBase, and CandidateTree.

Stop for explicit maintainer acceptance of the exact pending run. PASSED/approved requires a new
acceptance sidecar and byte-identical observations. Preserve all history. A semantic guide change
requires v2.

## D2 handoff and cleanup

#118 must rerun this same oracle after exact D2 approval over the approved browser/network matrix.
STUN-only failure remains FAIL or BLOCKED and cannot trigger automatic TURN work or scope downgrade.

For this local run, stop all fixture processes, peers, tracks, timers, listeners, and pages. Delete
only unique OS-temp candidate/output paths. Keep only sanitized artifacts and append-only history.
