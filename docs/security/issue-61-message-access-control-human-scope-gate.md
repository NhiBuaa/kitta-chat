# Issue #61 Message Access-Control Human Scope Gate

## Status

Both per-finding scope decisions are recorded. This gate is closed at the M1/M2 decision-recorded state. It does not authorize issue creation/publication, authentication or authorization remediation, a temporary network limiter, runtime/config changes, reproduction against a deployed system, instrumentation design, measurement, numeric tuning or alert dismissal.

Runtime exploitation has not been reproduced or claimed. The evidence below is limited to current repository route wiring and controller behavior.

| Finding | Recorded selection | Effective planning state |
| --- | --- | --- |
| M1 — message write integrity/access control | **B — Dedicated security follow-up** | Remediation assigned to combined message-access-control follow-up; Issue #61 accounting retained; route-specific limiter finalization blocked |
| M2 — horizontal authorization/data disclosure and resource amplification | **B — Dedicated security follow-up** | Remediation assigned to combined message-access-control follow-up; Issue #61 accounting retained; route-specific limiter finalization blocked |

Follow-up status: `dedicated message-access-control follow-up required / identifier pending`. No actual issue or cross-reference exists yet.

The M1/M2 scope gate no longer globally blocks consideration of a separate authorization gate for measurement/instrumentation **design** covering unrelated approved rate-limit classes. No such design is authorized by this decision. M1/M2 remain excluded from actor-level measurement/key design until their access-control follow-up establishes verified-principal and authorization semantics.

## Recorded Follow-up Organization

Planning recommends one combined dedicated `message access control` security follow-up because M1 and M2 share the same message API boundary. The follow-up must establish a coherent contract for authentication, verified requester identity, direct/group conversation membership, sender binding, visibility/authorization, query bounds/pagination, client/API compatibility and security regression tests.

Combining the findings is a planning disposition, not remediation and not issue-publication authorization. When authorized creation/publication produces a stable identifier, replace `dedicated message-access-control follow-up required / identifier pending` with the actual link/reference.

## M1 — Unauthenticated Message Creation

Route: `POST /api/messages`.

Source-confirmed behavior:

- `server/src/routes/messages.js` mounts `messageController.createMessage` without `authMiddleware`.
- `createMessage` reads caller-supplied `sender`, `receiver`, `isGroup`, `type`, `text` and `attachments` from `req.body`.
- The direct conversation identifier is derived from caller-supplied `sender` and `receiver`; group mode uses caller-supplied `receiver` as the conversation identifier.
- Persisted sender identity is not bound to a verified principal, and this route performs no direct/group membership authorization before saving.
- Caller-selected `type === "system"` enters the system-message creation path; caller-selected attachment identifiers can be persisted and populated.

Security consequence supported by source: possible sender impersonation, unauthorized conversation write and system-style message integrity impact. This is not a claim that exploitation has been reproduced in a deployed runtime.

Recorded disposition: `source-confirmed message write-integrity/access-control finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.

Issue #61 retains M1 classification, source evidence, current risk, scope-split reason, follow-up placeholder and final blocking/remaining-risk accounting. M1 is not remediated, false positive, duplicate or dismissed. Until a separate Issue #61 closure decision is recorded, M1 is unresolved remaining risk and blocks final actor/key implementation for this route; the B scope decision does not itself decide whether it blocks closure of Issue #61.

The combined follow-up must review route authentication; binding sender to the verified principal; direct/group membership authorization; receiver/conversation selection authorization; system-message/type integrity; attachment authorization; error/API compatibility; and regression tests. Caller-controlled sender, receiver, group, conversation, type or attachment values must never become authenticated actor identity.

## M2 — Unauthenticated Message-History Read

Route: `GET /api/messages/:userId1/:userId2`.

Source-confirmed behavior:

- `server/src/routes/messages.js` mounts `messageController.getMessages` without `authMiddleware`, so route wiring does not establish `req.user`.
- The controller derives a direct conversation from caller-selected `userId1` and `userId2`, or uses caller-selected `userId2` as the group conversation identifier when `isGroup=true`.
- Visibility identity is `req.user?.id || userId1`; without route authentication, caller-controlled `userId1` becomes the identity used for the participant visibility lookup.
- If no matching participant exists, or the lookup fails, the controller retains an empty visibility filter and queries the selected conversation.
- Caller-supplied `limit` is passed through `parseInt(limit, 10)` to Mongo `.limit()` without a server-side maximum.

Security consequence supported by source: possible horizontal authorization/data disclosure plus resource amplification. This is not a claim that exploitation has been reproduced in a deployed runtime.

Recorded disposition: `source-confirmed horizontal-authorization/data-disclosure and resource-amplification finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.

Issue #61 retains M2 classification, source evidence, current risk, scope-split reason, follow-up placeholder and final blocking/remaining-risk accounting. M2 is not remediated, false positive, duplicate or dismissed. Until a separate Issue #61 closure decision is recorded, M2 is unresolved remaining risk and blocks final actor/key implementation for this route; the B scope decision does not itself decide whether it blocks closure of Issue #61.

The combined follow-up must review route authentication; verified requester identity; removal of caller-controlled identity fallback semantics; direct/group visibility authorization; participant/membership lookup-failure semantics; bounded pagination/server-side maximum; response/status compatibility; and regression tests for unauthorized reads and amplification bounds. `userId1`, `userId2`, conversation and group identifiers remain resource/authorization dimensions, never authenticated actor identity.

## Per-Finding Scope Choices

| Finding | Choice | Security benefit | Issue #61 scope impact | Compatibility/API/client risk | Rate-limit actor-model effect | Does it block limiter finalization for this route? | Required approvals |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | **A — Remediate in Issue #61** | Can establish verified sender identity, membership authorization and message-integrity checks inside the baseline remediation | Expands Issue #61 across auth middleware, controller trust boundaries, direct/group authorization, system-message behavior, attachments and tests | High: existing clients currently send `sender`; response/error behavior and accepted message modes may change | After remediation, reclassify from a verified principal and approved authorization semantics; never key actor identity from body fields | **Yes**, until remediation semantics are approved and implemented far enough to define the verified actor/key boundary | Maintainer scope; security design/review; API/client owner; conversation/group authorization owner; test/acceptance approval |
| M1 | **B — Dedicated security follow-up** | Gives impersonation, authorization and message-integrity remediation a dedicated threat model and compatibility plan | Keeps access-control implementation outside Issue #61 while Issue #61 retains the blocking dependency for this route | Same substantive client/API risks, isolated to a dedicated follow-up with an explicit migration plan | Current network actor remains planning-safe only. Reclassify after follow-up establishes verified-principal/authz semantics | **Yes** by default. Temporary network-only defense requires a separate explicit decision and migration/removal contract | Maintainer scope; follow-up creation/publication authorization; security owner; API/client and conversation/group owners; later implementation approval |
| M1 | **C — Explicit defer / risk record** | Preserves visibility of unresolved integrity risk without implying remediation | Avoids implementation expansion but leaves a high-confidence source-level risk in Issue #61 remaining-risk accounting | No immediate compatibility change; security exposure remains | Stable authenticated actor cannot be derived. Network-only enforcement would remain a consciously temporary defense, not remediation | **Yes**, unless maintainer separately accepts temporary network-only limiting with expiry/migration and the risk record identifies the unresolved actor model | Authorized risk-acceptance owner; maintainer; security owner; explicit duration/review/expiry; separate approval for any temporary limiter |
| M2 | **A — Remediate in Issue #61** | Can establish verified requester identity, conversation/group authorization and a bounded query contract | Expands Issue #61 across auth wiring, visibility semantics, membership checks, pagination/limit behavior and tests | High: path contract, visibility results, status codes, pagination and client assumptions may change | After remediation, use the verified requester; path participants/conversation/group remain authorization/resource dimensions, never actor identity | **Yes**, until verified-principal and authorization semantics define the final route classification and keys | Maintainer scope; security design/review; API/client owner; conversation/group authorization owner; query/pagination acceptance |
| M2 | **B — Dedicated security follow-up** | Isolates horizontal-authorization, visibility and uncapped-query remediation in a focused security slice | Keeps access-control/query-contract implementation outside Issue #61 while Issue #61 retains the blocking dependency for this route | Same substantive API/client risks, managed through a dedicated migration and test plan | Current network actor remains planning-safe only. Reclassify after follow-up establishes verified requester/authz and bounded-query semantics | **Yes** by default. Temporary network-only defense requires a separate explicit decision and migration/removal contract | Maintainer scope; follow-up creation/publication authorization; security owner; API/client, conversation/group and query owners; later implementation approval |
| M2 | **C — Explicit defer / risk record** | Records the unresolved disclosure/amplification risk without falsely treating limiting as authorization | Avoids implementation expansion but leaves the finding and route-key ambiguity in Issue #61 remaining-risk accounting | No immediate compatibility change; disclosure/amplification exposure remains | Stable authenticated actor cannot be derived. Caller-supplied path/resource values remain prohibited as actor identities | **Yes**, unless maintainer separately approves a temporary network-only defense with expiry/migration and explicitly accepts the remaining access-control risk | Authorized risk-acceptance owner; maintainer; security owner; explicit duration/review/expiry; separate approval for any temporary limiter |

## Recorded Scope Disposition

Recorded **B — dedicated security follow-up for both M1 and M2**. Both findings cross authentication, principal binding, conversation/group authorization, API/client compatibility and rate-limit actor derivation. A focused follow-up can design those contracts without allowing rate limiting to masquerade as access-control remediation.

This decision does not create or publish an issue. The current combined placeholder is `dedicated message-access-control follow-up required / identifier pending`.

## Rate-Limit Taxonomy And Key Consequence

- `message_boundary_pending` remains a planning-only label, not a stable Redis class ID.
- Canonical network actor is planning-safe only while authentication is absent. It must not become a permanent actor/key contract merely because the vulnerability exists today.
- Caller-controlled `sender`, `userId1`, `userId2`, receiver, conversation, group, type or attachment identifiers must never become authenticated actor identity.
- After access-control remediation, both routes must be reclassified using the resulting verified-principal, authorization and bounded-query semantics.
- Route-specific distributed application limiter implementation is blocked by default until the follow-up resolves the actor/authz contract.
- A temporary network-only defense is permitted only after a separate explicit maintainer decision defining its limited purpose, failure mode, migration/removal trigger and verification. It must not be silently implemented or represented as the final distributed actor model.
- This B/B decision does not approve a temporary network-only application limiter. Nginx edge defense remains an independent control and is not final distributed application quota enforcement.

## Unchanged Planning State

- `read_bounded` remains `candidate enforcement; no distributed application counter until explicitly approved`. No new `read_bounded` gate is opened here.
- Retained evidence remains `B = 0`; no provenance audit #3 or raw-log access is authorized.
- All measurement-dependent numeric candidates remain pending. Static reasoning does not replace measurement, and all final numeric policies retain their existing governance gates.
- A separate authorization gate may now consider design-only work for a privacy-safe measurement slice covering unrelated approved classes. This decision does not authorize that design, instrumentation, telemetry linkage, measurement fields, benchmarks or production-value collection.
- M1/M2 must be excluded from actor-level measurement/key design until the follow-up resolves their verified-principal model. Current unauthenticated traffic must not be used as workload evidence for a final authenticated quota policy.
- Raw auth/recovery logs remain `restricted/quarantined for measurement use`.

## Decision Record And Terminal State

```text
M1: B — Dedicated security follow-up
M2: B — Dedicated security follow-up
```

No selected option authorizes implementation, issue creation/publication, runtime reproduction, temporary network limiting, measurement design, numeric tuning or alert disposition. Work stops at the M1/M2 decision-recorded state. The next candidate decision may be whether to authorize design-only work for a privacy-safe measurement slice covering unrelated approved rate-limit classes.
