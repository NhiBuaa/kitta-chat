# Immutable Review Snapshot: GitHub Issue #115

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#115`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/115
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Source base: `79a2653464d0bf798b95222ec7434ce8722a696b`
- Captured at: `2026-08-23`
- Purpose: immutable Spec input for Test Cases, the manual guide, TDD, and the later single whole-K6 review

## Title

K6-05 — WebRTC ICE configuration và call readiness fixture

## Body

### Parent

#110

### What to build

Deliver target-configurable WebRTC ICE URL metadata and a call-readiness fixture that distinguishes
signaling success from a usable media path. This ticket prepares source and local acceptance only;
it does not provision TURN, add a credential endpoint, bind a provider secret, or execute a live
network matrix.

### Locked ICE source and schema

For `public-demo`, the sole ICE authority is the already-approved same-origin
`/runtime-config.json` document at `webrtc.iceServers`. Vite output, hard-coded deployment values,
query parameters, local storage, Socket.IO payloads, and server/provider secrets are not authority.
#117 may render the non-secret runtime document into the edge image/runtime descriptor, but it may
not change this schema.

When `capabilities.calls=true`, `iceServers` must contain 1–4 entries and 1–8 unique normalized URLs
in total. Each entry contains exactly one `urls` field, which is either one string or an array of
1–4 strings. Public-demo accepts URL-only `stun:` or `stuns:` authorities with valid DNS/IPv4/IPv6
host and port, no whitespace, userinfo, path, fragment, arbitrary query, duplicates, or unsafe port.
The initial candidate uses the two existing non-secret STUN URLs:

- `stun:stun.l.google.com:19302`
- `stun:global.stun.twilio.com:3478`

When `calls=false`, the list must be empty and no peer may be constructed. Calls true with an empty
list, malformed/oversized/duplicate metadata, or any cross-field mismatch follows the existing
fail-closed runtime-config error path. Every peer receives an immutable clone from one validated
runtime-config snapshot; outgoing caller, normal answerer, glare winner, and glare loser have no
public-demo hard-coded fallback.

The legacy-local adapter retains the same two existing STUN servers, so local behavior is not
silently removed.

### Locked credential boundary

#115 is URL-only. Vite output and `/runtime-config.json` may never contain `username`, `credential`,
`credentialType`, shared secret, token, userinfo, credential query, or equivalent material,
regardless of lifetime. This ticket adds no TURN provider secret, backend binding, REST endpoint,
Socket.IO event, or payload field. `turn:`/`turns:` and short-lived credential delivery require a
separate approved design/ticket if D2 proves TURN necessary.

Retained fixture/evidence must contain no raw SDP, ICE candidate string, IP address, device label,
token, credential, or provider error text. Only fixed classifications, counts, booleans, synthetic
peer labels, and digests may be retained.

### Locked media-readiness oracle

Readiness is fixture/evidence state only. It does not alter product call state, signaling, history,
or persistence.

The local fixture observes both peers for at most 20 seconds, sampling every 500 ms. `ready`
requires all of the following:

1. both peer connections reach ICE `connected` or `completed`;
2. two samples at least 500 ms apart show increasing inbound RTP `bytesReceived` for every required
   media kind on each peer;
3. an audio call proves bidirectional audio; a video call proves bidirectional audio and video.

Offer/answer, `callAccepted`, ICE state alone, a remote-stream object alone, outbound-only RTP, or
one-way inbound RTP is never readiness. Terminal fixture classifications are exactly `ready`,
`signaling_only`, `ice_failed`, `media_timeout`, and `cancelled`. ICE `failed` is immediate;
`disconnected` receives at most a 5-second grace within the overall deadline. At the deadline,
signaling with no bidirectional RTP progress is `signaling_only`; partial/one-way progress is
`media_timeout`. Call end, peer replacement, or explicit cancellation is `cancelled` unless a prior
terminal result exists. Timers/listeners are removed exactly once; late events cannot change the
terminal result.

### Locked product-contract preservation

The readiness classifier cannot set or rename a product `CALL_STATES` value and cannot change:

- Socket.IO event names, payloads, ACKs, rooms, glare behavior, or authenticated `socket.userId`;
- REST `/api/calls` routes or response shapes;
- `CallHistory` status set, `answeredAt`, duration, participant access, or call-log creation;
- call acceptance/rejection/end timing or existing UI lifecycle semantics.

Preservation tests cover outgoing, answering, rejection, timeout, glare winner/loser, end-call,
participant-only history, and call-log behavior. Any desired product lifecycle/UI semantic change
requires a separate approved ticket.

### Acceptance criteria

- [ ] Public-demo ICE metadata obeys the exact same-origin source, count, URL, deduplication, and
  calls-enabled cross-field contract.
- [ ] Every peer construction path uses one validated immutable runtime snapshot; public-demo has
  no hard-coded fallback and calls-disabled constructs no peer.
- [ ] Legacy-local retains the existing two-STUN behavior.
- [ ] No long- or short-lived TURN credential material can enter public artifacts, runtime config,
  fixture output, or evidence; #115 adds no credential delivery API.
- [ ] The pure fixture classifier implements the exact sample/deadline/terminal contract and cannot
  count signaling-only or one-way media as ready.
- [ ] Existing signaling, authorization, REST, CallHistory, call-log, glare, and product-state
  contracts remain byte/shape compatible.
- [ ] Automated tests cover valid/invalid/oversized ICE metadata, all peer paths, disabled calls,
  credential sentinels, readiness/failure/concurrency, and product-contract preservation.
- [ ] Locked local acceptance uses two authenticated synthetic principals and synthetic media;
  it records `D2_MUTATIONS=0` and makes no deployed-network claim.

### Retained risks and boundaries

The K6 public-demo remains STUN-only. #118 runs this locked fixture after D2 over the approved
browser/network matrix. If bidirectional media does not satisfy the oracle, acceptance is FAIL or
BLOCKED pending a separate TURN/provider or scope-change decision; signaling success cannot pass
the case and call scope is not silently downgraded.

### Blocked by

- #111
- #112
