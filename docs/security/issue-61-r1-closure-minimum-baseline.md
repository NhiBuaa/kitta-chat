# Issue #61 R1 — Decision-Ready Closure-Minimum Baseline

## Status

**NUMERIC BASELINE APPROVED — IMPLEMENTED — VERIFICATION COMPLETE.**

Maintainer selected `Rate-limit closure-minimum baseline: A` and then
authorized `Rate-limit closure-minimum implementation: A`. Issue #61 remains
**NOT READY TO CLOSE**. The exact 27 values and contracts in this artifact are
implemented and source/test verified. This decision does not authorize
enablement/collection or analysis beyond the approved limiter, Nginx changes,
telemetry, deployment, a scanner run, or any alert disposition.

Retained production evidence remains `B = 0`. Every numeric row below is therefore an **INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED**.

## Locked enforcement contract

- Redis is shared across replicas. There is no in-memory runtime fallback.
- Same-stage mandatory buckets must have one atomic all-or-none admission decision when implementation is later authorized.
- `F-HTTP`: confirmed quota exhaustion returns HTTP `429`, generic `RATE_LIMITED`, and the maximum safely known `Retry-After`. Redis unavailability returns HTTP `503`, `RATE_LIMIT_UNAVAILABLE`.
- `F-SOCKET`: confirmed quota exhaustion returns a structured Socket.IO `RATE_LIMITED` error with `retryAfterSeconds`; it does not claim an HTTP status. Redis unavailability returns structured `RATE_LIMIT_UNAVAILABLE`.
- `read_bounded` has no distributed application counter.
- M1/M2, target-wide controls, actor-callee controls, verified reset-subject controls, and raw call-event control are excluded.
- R1 does not alter Nginx.

## Enforcement-point count

**27 enforcement points** are proposed:

- 4 auth-entry points;
- 2 recovery points;
- 2 refresh stages;
- 6 state-mutation points;
- 4 file-resource points;
- 8 expensive-read points; and
- 1 logical-call-attempt point.

## Exact baseline proposal

| # | Enforcement point | Algorithm and exact value | Actor/key scope | Failure contract | Rationale | Compatibility risk | Basis |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `auth_entry` aggregate | Sliding window: 20 attempts / 15 min; no separate burst | Canonical network actor across login, register, and Google entry | F-HTTP | Prevent route rotation across credential, account-creation, and provider work. | Shared NAT may couple distinct entry flows. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 2 | `auth_entry/login` | Sliding window: 10 attempts / 15 min; no separate burst | Canonical network actor + login operation | F-HTTP | Bound credential guessing and bcrypt work. | Redis-shared sliding admission is stricter than the current process-local fixed counter. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 3 | `auth_entry/register` | Sliding window: 5 attempts / hour; no separate burst | Canonical network actor + register operation | F-HTTP | Bound account-creation and hashing work. | Multiple legitimate signups behind one NAT can share the budget. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 4 | `auth_entry/google` | Sliding window: 10 attempts / 15 min; no separate burst | Canonical network actor + Google-entry operation | F-HTTP | Bound provider verification and session work. | Provider retry or outage behavior can consume a shared network budget. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 5 | `auth_recovery_request` | Sliding window: 5 attempts / hour; no separate burst | Canonical network actor before account lookup and queue work | F-HTTP | Bound recovery lookup and email-queue abuse without sharing completion capacity. | Shared NAT recovery requests can block legitimate recovery initiation. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 6 | `auth_recovery_complete` | Sliding window: 10 attempts / 15 min; no separate burst | Canonical network actor before token verification, DB, and bcrypt | F-HTTP | Bound expensive completion work independently from recovery requests. | A shared network may block a legitimate security-restoring completion. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 7 | `auth_refresh` Stage A | Token bucket: 60 attempts / min refill; capacity 10 | Canonical network actor before refresh-token verification | F-HTTP | Bound cryptographic verification before a verified subject exists. | NAT, bootstrap, or retry storms can block refresh verification. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 8 | `auth_refresh` Stage B | Token bucket: 20 attempts / min refill; capacity 5 | Canonical verified refresh-token subject after signature/type/subject verification, before DB and issuance | F-HTTP | Bound DB and token issuance across IP rotation by one verified subject. | Multi-tab or multi-device bootstrap can saturate one subject budget. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 9 | `state_mutation` aggregate | Token bucket: 120 attempts / min refill; capacity 30 | Verified user across all mutation domains | F-HTTP | Bound cross-domain DB, queue, cache, and realtime mutation rotation. | One noisy mutation domain can delay another for the same user. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 10 | `state_mutation/profile` | Token bucket: 10 attempts / hour refill; capacity 3 | Verified user + profile domain | F-HTTP | Bound low-cadence profile and avatar mutation amplification. | Editing retries can block legitimate settings work. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 11 | `state_mutation/friendship` | Token bucket: 30 attempts / min refill; capacity 10 | Verified user + friendship domain | F-HTTP | Bound request, accept, reject, and remove fan-out. | Bulk legitimate relationship actions can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 12 | `state_mutation/group_admin` | Token bucket: 30 attempts / min refill; capacity 10 | Verified user + group-administration domain | F-HTTP | Bound create/member/admin/rename/delete fan-out. | Active administration, especially in large groups, can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 13 | `state_mutation/conversation_panel` | Token bucket: 60 attempts / min refill; capacity 15 | Verified user + panel-mutation domain | F-HTTP | Bound preference, leave, and delete state writes. | UI retries or toggles can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 14 | `state_mutation/call_history` | Token bucket: 120 attempts / min refill; capacity 30 | Verified user + call-history-mutation domain | F-HTTP | Bound per-call and read-all write bursts. | Multi-device read marking can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 15 | `file_resource` aggregate | Token bucket: 300 attempts / hour refill; capacity 50 | Verified user across upload lifecycle and signing | F-HTTP | Bound combined S3, queue, presign, and buffering work. | Multipart-heavy users can exhaust the aggregate. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 16 | `file_resource/upload_control` | Token bucket: 30 attempts / hour refill; capacity 10 | Verified user + upload-control domain | F-HTTP | Bound init, complete, single-upload, and avatar admission. | Legitimate upload initiation/completion retries can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 17 | `file_resource/part_presign` | Token bucket: 240 attempts / hour refill; capacity 40 | Verified user + part-presign domain | F-HTTP | Permit bounded multipart progress while limiting signing amplification. | Large files or high retry counts can stall before all parts are signed. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 18 | `file_resource/download_signing` | Token bucket: 120 attempts / hour refill; capacity 30 | Verified user + download-signing domain | F-HTTP | Bound repeated authorization and signed-URL generation. | Active users can block legitimate downloads. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 19 | `read_expensive` aggregate | Token bucket: 240 attempts / min refill; capacity 60 | Verified user across all expensive-read domains | F-HTTP | Bound route and screen rotation across query/fan-out work. | One reconnect/search/sidebar loop can starve another screen. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 20 | `read_expensive/user_directory` | Token bucket: 60 attempts / min refill; capacity 20 | Verified user + directory/search domain | F-HTTP | Bound users, friends, requests, search, and list query work. | Search-heavy use can block relationship reads. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 21 | `read_expensive/message_sync` | Token bucket: 12 attempts / min refill; capacity 4 | Verified user + message-sync domain | F-HTTP | Bound reconnect and fan-out synchronization loops. | Unstable networks or several tabs can delay sync. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 22 | `read_expensive/call_history` | Token bucket: 30 attempts / min refill; capacity 10 | Verified user + call-history-read domain | F-HTTP | Bound history and missed-call aggregation. | Refresh or pagination can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 23 | `read_expensive/groups` | Token bucket: 60 attempts / min refill; capacity 20 | Verified user + groups domain | F-HTTP | Bound group list/detail/member fan-out. | Active navigation or large groups can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 24 | `read_expensive/conversation_panel` | Token bucket: 60 attempts / min refill; capacity 20 | Verified user + panel-read domain | F-HTTP | Bound metadata and resources fan-out at the panel domain. | Panel refresh or realtime loops can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 25 | `read_expensive/panel_resources` | Sliding window: 30 attempts / min; no separate burst | Verified user + canonical validated conversation | F-HTTP | Bound one user's resource fan-out in one conversation. | Redis-shared enforcement can be materially stricter than the current process-local default during reconnect or multi-tab use. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 26 | `read_expensive/sidebar` | Token bucket: 60 attempts / min refill; capacity 20 | Verified user + sidebar domain | F-HTTP | Bound both sidebar fan-out paths. | Bootstrap and realtime refresh can block. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |
| 27 | `call_initiation` aggregate | Sliding window: 10 **logical attempts** / min; no separate burst | Handshake-verified Socket user; `initCall` and a correlated `callUser` count once | F-SOCKET | Bound cross-socket and cross-replica call setup work without protocol-event double charging. | Multi-device, redial, reconnect, glare, and correlation errors can cause legitimate call setup blocks. | INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED |

## Explicit exclusions

No value is proposed for:

- `read_bounded`;
- M1/M2 message routes;
- login/forgot account target-wide buckets;
- verified reset-subject, actor-file/upload, actor-callee, callee-wide, file-wide, or conversation-wide secondary controls; or
- a raw Socket.IO call-event control.

The raw call-event plane remains unresolved. R1 does not invent a number for it. A correlated `callUser` remains part of the charged logical attempt; an unmatched `callUser` starts a new logical attempt. Replayed phases must later be suppressed before expensive work or handled by a separately approved raw-event control.

## Values not safe to recommend without explicit acceptance

The table is decision-ready, but the following proposals carry material unresolved compatibility risk and must not be described as evidence-backed behavior preservation:

1. Recovery request, recovery completion, and both refresh stages can block security-restoring or session-continuity work.
2. `read_expensive/message_sync`, `read_expensive/panel_resources`, and `call_initiation` depend on reconnect, multi-tab/device, or logical-attempt behavior that retained evidence cannot establish.
3. File-part presigning can interrupt a valid large upload before all parts are signed.
4. All actor-wide aggregates can create within-actor cross-domain or cross-screen starvation.

Choosing A means the maintainer explicitly accepts those intentional-hardening risks. Choosing B preserves the hold; it does not weaken the security finding or authorize a substitute local fallback.

## Maintainer decision — A

Approved exactly as written:

- all 27 enforcement values, algorithms, capacities and windows;
- the locked failure contracts and Redis-shared/no-fallback invariants; and
- the documented NAT/shared-IP, distributed-tightening and bounded-burst compatibility risks.

The approval semantics for every numeric row remain:

`INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED`

`B = 0` remains unchanged. This approval does not promote any value to runtime evidence and does not approve a substitute local limiter, any excluded control, or a silent numeric change.

## Stop condition

Stop at the rate-limit implementation authorization gate. A later, separate implementation authorization is required before any runtime change.
