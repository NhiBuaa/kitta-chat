# Issue #61 Privacy-Safe Measurement Design Authorization Gate

## Status

Maintainer choice **A — `Authorize bounded measurement-slice design only`** is recorded. Refined Level 1 design is complete in [issue-61-privacy-safe-measurement-slice-design.md](issue-61-privacy-safe-measurement-slice-design.md). This decision does not authorize Level 2A aggregate instrumentation, Level 2B linkage instrumentation, deployment, behavioral collection, production access, benchmarks, analysis or quota tuning.

Current state remains unchanged: retained evidence is `B = 0`; every numeric quota remains pending; M1/M2 are excluded; `read_bounded` remains unenforced; raw auth/recovery logs remain `restricted/quarantined for measurement use`; and no instrumentation or production access is approved.

## Authorization Levels

| Level | Status under this gate | Permitted or prohibited activity |
| --- | --- | --- |
| **Level 1 — Design** | May be authorized only by choice A | Define measurement questions, candidate metric/event schemas, privacy-safe linkage alternatives, aggregation boundaries, retention/access requirements, planning-level sampling, observation/censoring model, deployment/rollback/removal contract, validation plan and future implementation-approval checklist |
| **Level 2A — Aggregate-only instrumentation** | Not authorized by this gate | No aggregate metric/event implementation, hooks, middleware, runtime/config or adapter changes |
| **Level 2B — Telemetry identity/linkage design + implementation** | Not authorized by this gate or by any future 2A approval | No actor/network/session/subject/target/callee linkage, logical-attempt correlation, pseudonym, shared linkage state or key material |
| **Level 3 — Behavioral collection/production measurement** | Not authorized by either choice | No production-value reads, rates/percentiles, actor correlation, benchmark/load test, behavioral extraction or quota tuning |

## Human Choices

| Choice | Decision | Effect | Explicit non-authorization |
| --- | --- | --- | --- |
| **A** | `Authorize bounded measurement-slice design only` | Allows creation of the twelve planning outputs listed below, limited to the approved first-slice scope and privacy guardrails | Does not authorize instrumentation implementation, provider/storage selection, deployment, production access, behavioral collection, benchmarks, analysis or numeric-policy changes |
| **B** | `Keep measurement design on hold` | Preserves the current planning/evidence state without producing a measurement design | Does not alter `B = 0`, numeric gates, current limiter taxonomy, M1/M2 status or log quarantine |

## Bounded First-Slice Scope If A Is Selected

This authorization must not become a generic repository observability framework.

| Candidate area | Included design questions | Boundary |
| --- | --- | --- |
| `auth_entry` | Login, register and Google-auth approval uncertainties; shared-network and operation-specific evidence needs | Design only; no raw network/account identity and no current-log parsing |
| `auth_recovery_request` | Forgot-password request/queue/recovery-availability uncertainties | Design must not open quarantined logs or depend on credential-bearing paths |
| `auth_recovery_complete` | Reset-completion verification/DB/bcrypt/retry uncertainties | No reset token, URL/path, user identifier or historical-log access |
| `auth_refresh` | Stage A canonical-network questions and Stage B cryptographically verified refresh-token-subject questions | Raw refresh token is prohibited; Stage B identity is not proof that the user record remains active |
| Representative authenticated workload | Recorded design selection: `friendship` mutation only | Validates instrumentation mechanics only; cannot support numeric policy for other mutation domains or `state_mutation`. Call-history read is not a second representative in this slice |
| `call_initiation` | Logical-attempt, multi-socket, correlation and replay evidence questions | No callee, conversation, call ID or payload collection; server-generated logical-attempt alternatives may be compared but not implemented |

Explicitly excluded from first-slice actor-level design:

- M1 `POST /api/messages`;
- M2 `GET /api/messages/:userId1/:userId2`;
- `message_boundary_pending`;
- `read_bounded`;
- target-wide account, callee, file or conversation enforcement measurement;
- any other state/read domain not selected as the single representative workload.

Target-wide telemetry-only questions are excluded by default. They require an explicit scope amendment with a concrete evidence question and non-enforcement/privacy justification before entering this design.

## Privacy Guardrails

Design must begin with data minimization. It may not propose collection of raw IP, email, username, user ID, JWT, refresh/reset token, reset URL/path, limiter/account HMAC digest, callee/conversation/call/file ID, filename/object key, message content or search content.

Purpose-separation invariant:

> `rate-limit enforcement identity and measurement-linkage identity are separate security/privacy purposes unless an explicit design review proves reuse is necessary and safe`

The design must not default to reusing Redis limiter keys, limiter actor keys or limiter HMAC derivation. If an evidence question cannot be answered by aggregate metrics, the design must explain why and compare only planning-level alternatives such as aggregate-only measurement, ephemeral in-process/session correlation, short-lived purpose-specific keyed pseudonyms or server-generated logical-attempt identifiers. No pseudonym, hash, HMAC or key material may be created or selected under this gate.

For every linkage alternative considered later, Level 1 design must document evidence enabled, privacy/re-identification risk, cardinality, rotation, minimum correlation lifetime, retention, cross-replica need, restart/deployment survival, deletion/expiry semantics, access role and any new secret/key-management obligation.

Prefer counters, histograms, short-lived aggregation and no event-level persistence whenever they answer the approval question. Every proposed field/event must carry a retention class, aggregation horizon, access role, export restriction, deletion/expiry rule and a justification if raw event storage is claimed necessary. Actual provider/storage selection remains outside this gate.

Raw auth/recovery logs remain `restricted/quarantined for measurement use`. The design may not depend on opening them, parsing credential-bearing paths or combining this slice with the reset-token logging follow-up.

## Required Design Method If A Is Selected

The design must begin with approval questions, not available fields. For each in-scope numeric candidate it must state:

- the exact uncertainty blocking approval;
- empirical evidence that could reduce it;
- normative decisions measurement cannot resolve;
- the minimum sufficient observation;
- evidence that would reject or redesign the candidate.

Only then may it derive a minimum candidate schema.

Every proposed metric/event must identify its observation point in the chain:

```text
edge
→ parser
→ application admission
→ auth verification
→ actor/domain limiter stage
→ authorization
→ business/dependency work
→ outcome
```

It must state upstream censoring, represented and unrepresented rejected traffic, required success/failure outcomes, and questions the observation can and cannot answer. “Count requests” alone is not a sufficient justification.

## Required Design Outputs If A Is Selected

Level 1 design must produce exactly these bounded planning outputs:

1. Measurement objectives.
2. Candidate coverage list.
3. Explicit exclusions.
4. Evidence-question to minimum-data matrix.
5. Candidate metric/event schemas.
6. Observation/censoring points.
7. Privacy/linkage alternatives.
8. Retention/access matrix.
9. Normative questions measurement cannot solve.
10. Level 2A and Level 2B implementation prerequisites.
11. Rollback/removal plan.
12. Separate future gates for Level 2A, Level 2B, deployment, behavioral collection, analysis and numeric-policy review.

Every proposed element must state a future feature/config gate, disable path, residual-state behavior, TTL/deletion expectation, removal proof and whether code should remain after numeric policy finalization. One-time tuning telemetry should be removable unless explicit ongoing operational value is established.

## Recorded Decision

Recorded **A — `Authorize bounded measurement-slice design only`**. The approved scope targets stable actor semantics and high-value evidence blockers while preserving separate future approvals for Level 2A aggregate-only implementation, Level 2B telemetry identity/linkage, deployment, behavioral collection, production-data analysis and numeric review.

The Level 1 design produced by A does not approve any later authorization level.

## Decision Record And Terminal State

```text
Measurement design: A — Authorize bounded measurement-slice design only
```

Level 2A aggregate-only instrumentation, Level 2B telemetry identity/linkage design + implementation and Level 3 behavioral collection/production measurement remain on hold. Stop for maintainer review of the refined Level 1 design.
