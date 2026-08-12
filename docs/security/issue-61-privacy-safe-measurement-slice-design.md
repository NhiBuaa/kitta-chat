# Issue #61 Privacy-Safe Measurement Slice — Level 1 Design

## Status And Authorization Boundary

Maintainer choice A authorizes this bounded **Level 1 design only**. This document is not approval for Level 2A aggregate-only instrumentation, Level 2B telemetry identity/linkage design + implementation, telemetry identities or secrets, provider selection, deployment, production access, behavioral collection, benchmarks/load tests, analysis, quota tuning or alert dismissal. Level 2A approval would not imply Level 2B approval.

Historical status addendum: Issue #61 later resolved its M1/M2, reset-token, browser-origin and `/ops` closure blockers. That does not authorize D1/D2 deployment or measurement collection; `B = 0` remains and public-demo deployment needs a separate authorization.

Every numeric value below is copied unchanged from the pending quota proposal. No value is approved by this design.

Retained evidence remains `B = 0`. Raw auth/recovery logs remain `restricted/quarantined for measurement use` and are not an input source.

## 1. Bounded Objectives And Exclusions

### Objectives

The first slice is designed to reduce specific evidence blockers for:

- `auth_entry`: login, register and Google auth;
- `auth_recovery_request`: forgot-password;
- `auth_recovery_complete`: reset completion and the optional verified reset-subject question;
- `auth_refresh`: Stage A network admission and Stage B canonical cryptographically verified refresh-token subject;
- friendship mutation as the only representative `state_mutation` workload;
- `call_initiation`: logical attempts, phase correlation, replay/duplicates, multi-socket/device behavior, redial, glare and reconnect.

Friendship evidence may validate reusable measurement mechanics. It must not be generalized into a numeric policy for the `state_mutation` aggregate or another mutation domain without domain-specific evidence.

### Explicit exclusions

- M1 `POST /api/messages`;
- M2 `GET /api/messages/:userId1/:userId2`;
- `message_boundary_pending`;
- `read_bounded`;
- call-history read or any other second representative workload;
- unselected state/read/file/resource domains;
- target-wide account, callee, file or conversation enforcement measurement;
- target linkage, account existence linkage or recovery request-to-account correlation;
- generic repository observability framework design.

Target-wide concentration remains only an unresolved future evidence question. No target-linkage schema is designed here.

## 2. Evidence Types And Decision Discipline

Two evidence types remain separate:

| Evidence type | What it can establish | What it cannot establish alone |
| --- | --- | --- |
| Security-policy / compatibility | Legitimate cadence and bursts, shared-network or multi-device behavior, recovery usability, redial/reconnect choreography, collision/starvation risk | Backend capacity, dependency-cost distribution or the maintainer's acceptable abuse tolerance |
| Capacity / performance | Bcrypt/provider/DB/queue/Redis/signalling cost and the consequence of admitted work | A legitimate quota threshold or acceptable user-facing rejection rate |

The design rejects both invalid inferences:

```text
backend can handle X
therefore quota should be X
```

```text
production usually observes X
therefore security tolerance should be X
```

Measurement can narrow uncertainty. It cannot replace normative product/security decisions or final governance approval.

## 3. Candidate Coverage And Decision Questions

| Pending candidate | Exact blocking uncertainty | Uncertainty class | Evidence that could reduce it | Normative decision remaining | Support signal | Reject signal | Redesign signal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `auth_entry` aggregate — sliding `20/15 min` | Whether legitimate mixed login/register/Google traffic from one network needs more independent headroom than the aggregate permits | Compatibility/fairness; workload envelope | Privacy-safe network-burst distribution plus aggregate operation mix and downstream cost | Acceptable shared-network coupling across three entry paths | High-percentile mixed bursts remain below candidate with low cross-operation overlap | Normal shared-network bursts frequently exceed candidate | One operation dominates or network linkage cannot be justified safely; revisit aggregate topology |
| Login — sliding `10/15 min` | Whether intentional distributed/sliding/admitted-attempt hardening is compatible enough to accept | Compatibility/fairness; abuse tolerance | Static legacy fingerprint plus aggregate outcomes/cost; optional network-burst evidence only if separately approved | Explicit acceptance of coordination, algorithm and accounting changes | Static decision accepts hardening and aggregate failure signals remain acceptable | Maintainer rejects legacy semantic changes or legitimate-login failure evidence is material | Preserve hardening goal but revise number/accounting after evidence |
| Register — sliding `5/hour` | Whether a Redis-shared network ceiling would block legitimate shared-network signups | Compatibility/fairness; workload envelope | Network-burst distribution if linkage is approved; aggregate registration outcomes and bcrypt cost otherwise | Acceptable shared-network signup tolerance | Legitimate burst summaries remain within candidate | Material normal bursts exceed candidate | Signup flow needs a different actor/fairness control |
| Google — sliding `10/15 min` | Whether provider retry/bootstrap behavior fits the operation and class aggregate | Workload envelope; provider/censoring; capacity | Aggregate provider verification duration/error plus optional network/session burst summaries | Supported retry behavior during provider instability | Normal retries and provider recovery fit candidate | Provider incidents cause legitimate bursts above candidate | Separate provider-outage handling or revised operation policy needed |
| Recovery request — sliding `5/hour` | Whether network admission protects lookup/queue work without harming security-restoring availability | Compatibility/fairness; recovery usability; capacity | Aggregate route work, queue-publication outcome and worker outcome; network bursts only under separate linkage approval | Shared-network recovery tolerance and acceptable queue/email protection | Candidate covers normal admitted requests while queue pressure is bounded | Legitimate recovery demand is materially rejected or queue benefit is negligible | Separate availability control or revised admission semantics needed |
| Recovery completion — sliding `10/15 min` | Whether legitimate reset retries fit while token/DB/bcrypt work remains bounded | Recovery usability; workload envelope; capacity | Aggregate stage counts/durations without target/token linkage; optional network retry summaries under linkage approval | Acceptable throttling of a security-restoring operation | Aggregate completion attempts and coarse retries fit candidate | Valid-user support/usability evidence indicates normal retries exceed candidate | Stage topology or retry semantics need redesign |
| Optional verified reset subject — sliding `5/hour` | Whether a cheap post-verification subject seam adds enough protection to justify privacy/fairness complexity | Abuse tolerance; recovery fairness; seam feasibility | Static seam proof plus aggregate post-verification DB/bcrypt cost; subject frequency only after a separate linkage gate | Whether the optional bucket should exist at all | Expensive post-verification repetition is material and safe linkage is justified | Aggregate cost is low or linkage risk exceeds benefit | Keep only network bucket or find a non-linked work-control mechanism |
| Refresh Stage A — token `60/min`, capacity `10` | Whether shared-network bootstrap/retry storms fit the proposed verification budget | Compatibility/fairness; protocol choreography; capacity | Aggregate verification count/duration/outcome plus optional network/session burst summaries | Supported tabs/devices per network and retry behavior | Normal aggregate load and approved burst summaries fit capacity/refill | Normal bootstrap/retry behavior exceeds candidate | Separate bootstrap handling or revised Stage A policy |
| Refresh Stage B — token `20/min`, capacity `5` | Whether one verified refresh-token subject legitimately produces more DB/token work across tabs/devices | Multi-device/session behavior; capacity; privacy | Aggregate Stage-B DB/token duration/outcome; subject cadence only after separate privacy-linkage approval | Supported multi-device/session behavior and subject-sharing fairness | Aggregate cost is material and approved subject summaries fit candidate | Legitimate subject cadence exceeds candidate or linkage is unjustified | Revise Stage B topology or keep aggregate-only protection |
| Friendship — token `30/min`, capacity `10` | Whether one verified user legitimately rotates across send/accept/reject/remove actions above the secondary budget | Compatibility/fairness; workload envelope; DB/realtime cost | Aggregate action/outcome/cost; actor-burst summaries only after linkage approval | No additional normative blocker currently identified, but governance remains required | Actor summaries fit candidate and aggregate fan-out consequence is material | Legitimate bulk workflows exceed candidate | Split action family or revise capacity/refill; do not generalize to all mutations |
| Call aggregate — sliding `10 logical attempts/min` | Whether one logical-attempt unit across `initCall`/`callUser` handles multi-socket, redial, reconnect and glare | Protocol choreography; compatibility/fairness; cost | Phase counts, aggregate outcomes, phase-gap distributions; logical-attempt correlation if separately approved | Supported call retry/redial/glare behavior | Most valid sequences correlate once and retry bursts fit candidate | Duplicates/glare/reconnect make one-unit correlation unreliable or normal bursts exceed candidate | Redesign logical-attempt state machine or quota unit |
| Actor-callee — sliding `4 logical attempts/5 min` | Whether pair protection reduces harassment without blocking legitimate connectivity retries | Abuse tolerance; fairness; privacy | Aggregate redial/outcome evidence; pair concentration only after a high-scrutiny linkage gate | Acceptable anti-harassment versus redial tradeoff | Product/security evidence supports pair control and safe linkage | Legitimate redials would be blocked or pair linkage privacy cost is excessive | Keep pending/remove pair bucket; consider non-linked product controls |
| Raw call-event control — no number | Whether replayed/duplicate raw handler events create enough evaluator/CPU/memory cost to justify a separate control | Protocol choreography; capacity; policy existence | Aggregate phase/event counts and stage duration; logical-attempt correlation only if approved | Whether the control should exist at all | Replayed/suppressed work is material relative to normal signalling | Aggregate event work is negligible | Improve idempotent suppression before proposing a numeric raw-event bucket |

## 4. Evidence-Question To Minimum-Data Matrix

The proposed fields are low-cardinality allowlisted dimensions. `link_ref` below is a placeholder for comparing alternatives, not an approved field or identity mechanism. It must be absent unless a separate telemetry-linkage gate approves one design.

| Pending candidate | Blocking question | Evidence type | Observation point | Upstream censoring | Minimum fields or aggregates | Linkage required? | Aggregate-only sufficient? | Minimum horizon | Privacy sensitivity | Normative input still required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth_entry` `20/15 min` | Mixed-entry/network burst fairness | Security-policy + capacity | Existing backend HTTP completion; proposed pre-auth operation admission and downstream stages | Nginx edge; parser for route-attributed observations; current per-route limiters for login/register | `class`, `operation`, `stage`, `outcome`, count, duration histogram; optional attempts-per-network-window histogram | Yes for final network fairness | No for mixed per-network bursts; yes for aggregate mix/cost | 14 days including peak/weekend | High if network linkage; low aggregate-only | Shared-NAT tolerance and cross-operation coupling |
| Login `10/15 min` | Hardening compatibility | Security-policy + capacity | Existing login route completion; proposed pre-DB/bcrypt stages | Edge, parser, current login limiter | Operation/stage/outcome counts and duration; static semantic fingerprint; optional network burst histogram | No for intentional-hardening decision; yes for NAT claim | Yes for static decision and cost, no for NAT fairness | 14 days if compatibility evidence is requested | Medium aggregate; high linked | Accept all three semantic changes and dropped legacy behavior |
| Register `5/hour` | Shared-network signup fairness | Security-policy + capacity | Existing route completion; proposed pre-DB/hash stages | Edge, parser, current register limiter | Operation/stage/outcome counts, bcrypt duration, optional attempts-per-network-window histogram | Yes for fairness | Yes for cost; no for network burst | 30 days | High linked | Acceptable shared-network signup behavior |
| Google `10/15 min` | Provider retry and network cadence | Security-policy + capacity | Existing route completion; proposed provider-verification and DB/queue stages | Edge and parser; no current application route limiter | Provider stage duration/outcome, route outcome, queue-publication aggregate; optional network/session burst histogram | Yes for retry chains/network cadence | Yes for provider cost/errors; no for retry-chain cadence | 14 days including provider disruption if observed later | High linked; medium provider aggregates | Supported retries during provider instability |
| Recovery request `5/hour` | Recovery availability versus work protection | Security-policy + capacity | Existing route completion; proposed admission, lookup-work, queue-publication; existing downstream worker outcomes | Edge, parser, current forgot limiter; worker metrics see published jobs only | Generic route outcome; lookup-work duration with no existence label; queue publication `attempted/accepted/error` aggregates; worker job outcome | Yes only for network fairness; account linkage prohibited | Yes for work/queue cost; no for network burst | 60 days due low cadence | High network-linked; aggregate recovery data restricted | Recovery availability and shared-network tolerance |
| Recovery completion `10/15 min` | Legitimate retries versus stage cost | Security-policy + capacity | Existing route completion; proposed validation, DB/token-check/bcrypt stage aggregates | Edge and parser; no current app limiter; current source performs DB lookup before token verify | Counts/durations by coarse stage and generic `continued/stopped/error`; no token-valid/account-exists label | Yes only for network retry chains | Yes for aggregate cost; no for per-network retries | 60 days | Very high if linked; restricted aggregate | Acceptable reset retry availability |
| Verified reset subject `5/hour` | Optional subject bucket value | Security-policy + capacity | Hypothetical post-cryptographic-verification/pre-expensive-work seam; no approved current seam | All upstream stages plus successful crypto verification | Aggregate post-verification count/duration; optional attempts-per-subject-window histogram only after linkage gate | Yes for subject frequency | Yes for seam/cost; no for frequency/fairness | 60 days after later implementation/deployment gates | Very high | Whether bucket exists; cheap seam and privacy justification |
| Refresh Stage A `60/min`, cap `10` | Network/tabs bootstrap envelope | Security-policy + capacity | Existing route completion; proposed immediately before and after refresh-token verification | Edge and parser; no current app limiter | Stage-A count/duration with coarse outcome; optional network-window and ephemeral-session concurrency histograms | Yes for network/tabs | Yes for verification cost; no for network/tabs cadence | 14 days | High linked | Supported NAT/tab/retry behavior |
| Refresh Stage B `20/min`, cap `5` | Verified-subject multi-device cadence | Security-policy + capacity | Hypothetical after signature/type/subject verification and before `User.findById`; current helper combines verification and DB | Stage A plus successful cryptographic verification | Aggregate DB/token-issuance duration/outcome; optional attempts-per-subject-window histogram | Yes for subject cadence | Yes for downstream cost; no for per-subject cadence | 14 days | Very high | Multi-device fairness and approval of Stage-B seam |
| Friendship `30/min`, cap `10` | Per-user cross-action bursts and fan-out | Security-policy + capacity | Existing HTTP completion; proposed after auth actor derivation, before DB, after DB/realtime | Edge, parser and auth; friendship routes currently collapse to `UNMAPPED_ROUTE` in existing metrics allowlist | `action`, `stage`, `outcome`, DB/realtime duration/count; optional actions-per-user-window histogram | Yes for actor rotation/burst | Yes for aggregate cost/actions; no for actor rotation | 14 days | High linked; low aggregate | Governance; no generalization to other mutation domains |
| Call aggregate `10/min` | Logical-attempt choreography | Security-policy + capacity | Existing post-handshake `initCall`/`callUser` handlers; proposed raw-handler, correlation, business-work and outcome stages | Nginx Socket.IO connection control and handshake auth; `callUser` current process-local limiter; `initCall` unprotected | `phase`, `stage`, `outcome`, count, duration; phase-gap/events-per-attempt histograms only with correlation | Yes for phase/replay/multi-socket | Yes for event/cost totals; no for logical-attempt correctness | 30 days | High linked | Supported redial/reconnect/glare and logical unit semantics |
| Actor-callee `4/5 min` | Pair retry fairness | Security-policy | Proposed logical-attempt stage after handshake; no current pair measurement | Edge/handshake and current `callUser` limiter | Aggregate redial/outcome counts; pair-window histogram only after separate high-scrutiny linkage approval | Yes | No for pair concentration; aggregate can only inform general redial | 30 days if later approved | Very high | Harassment versus legitimate redial tolerance |
| Raw call-event — no number | Whether raw-event control exists | Capacity + policy existence | Proposed raw handler entry immediately after handshake, before correlation/suppression/business work | Edge connection control and handshake; not raw network demand | `phase`, `syntactic_class`, count, handler-duration histogram, coarse `continued/suppressed/error` | No for aggregate evaluator cost; yes for replay classification | Yes for raw handler load/cost; no for duplicate attribution | 14 days after later gates; production collection not yet approved | Low aggregate; high linked | Whether an extra control is justified |

### Level 2A versus Level 2B coverage and decision value for all 13 rows

Notation: `U` means unsampled observation attempt: every eligible occurrence is intended to be recorded without probabilistic sampling. `U` does not guarantee interval completeness. `L` means full-observation latency by default, or a later reviewed probability with a known eligible denominator. Telemetry failure in every row drops only the observation, produces at most bounded coarse loss/health evidence and never changes business or limiter behavior.

| Pending candidate | Exact numeric approval question | What aggregate-only 2A can answer | What 2A cannot answer | Can 2A change approval mode/status? | Decision value | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_entry` `20/15 min` | Is the shared network-actor aggregate compatible with legitimate mixed login/register/Google use? | Operation mix, stage reachability and aggregate dependency cost | Per-network mixed bursts, shared-NAT concurrency and cross-operation starvation | No; linkage or explicit intentional-hardening acceptance remains required | `context-only` | Context only; do not instrument for this number in first 2A |
| Login `10/15 min` | Is the intentional distributed/sliding/admitted-attempt hardening compatible enough, including shared NAT? | Bcrypt/DB cost, coarse outcomes and whether expensive stages are reached | Network burst distribution, distinct users behind NAT and legitimate retry cadence | It can inform the static hardening decision but cannot make a NAT-compatibility claim | `context-only` | Context only; existing static decision remains the primary gate |
| Register `5/hour` | Does the per-network policy allow legitimate signup behavior without unsafe abuse capacity? | Aggregate registration stage outcomes and bcrypt/DB cost | Per-network signup bursts, distinct-session concurrency and shared-network fairness | No | `context-only` | Context only; do not instrument for this number in first 2A |
| Google `10/15 min` | Does the per-network policy tolerate legitimate provider retry chains? | Aggregate provider/DB/queue outcomes and cost | Per-network retry chains, session concentration and shared-NAT behavior | No | `context-only` | Context only; do not instrument for this number in first 2A |
| Recovery request `5/hour` | Can legitimate recovery initiation coexist with network abuse protection without starvation? | Aggregate generic stage reachability, queue publication and worker cost | Per-network retries, account existence, target cadence and request-to-delivery/recovery linkage | No; it must not weaken non-enumeration to obtain an answer | `context-only` | Context only; do not instrument for this number in first 2A |
| Recovery completion `10/15 min` | Does the network budget tolerate legitimate reset retries while protecting verify/bcrypt/DB work? | Coarse aggregate stage reachability and cost without token-validity labels | Per-network retry chains and verified-subject retry frequency | No | `context-only` | Context only; do not instrument for this number in first 2A |
| Verified reset subject `5/hour` | Is a subject-scoped completion budget compatible and proportionate? | Only aggregate post-verification volume/cost if a safe seam exists | Per-subject repetition and the fairness question that defines the number | No; 2B linkage is required and carries disproportionate recovery privacy cost for first 2A | `omit from first 2A implementation` | Omit |
| Refresh Stage A `60/min`, cap `10` | Does the network budget tolerate bootstrap/tab/device retry behavior? | Aggregate cryptographic verification volume, cost and coarse outcomes | Per-network bursts, tabs/devices and retry sequences | No | `context-only` | Context only; do not instrument for this number in first 2A |
| Refresh Stage B `20/min`, cap `5` | Does the verified-subject budget tolerate legitimate multi-device/session refresh cadence? | Aggregate DB/token-issuance cost after cryptographic verification | Per-subject cadence, device/session concentration and actor burst | No | `context-only` | Context only; do not instrument for this number in first 2A |
| Friendship `30/min`, cap `10` | Is the verified-user cross-action budget compatible with legitimate friendship bursts? | Aggregate action/stage outcomes, DB/realtime cost and instrumentation mechanics | Per-user bursts, cross-action rotation and all other mutation domains | No; it cannot establish per-user `30/min` compatibility | `context-only` | Context only; do not instrument for this number in first 2A |
| Call aggregate `10/min` | Is the per-user logical-attempt budget compatible with call choreography and multi-client behavior? | Aggregate `initCall`/`callUser` handler volume, stage mix and cost | Logical-attempt membership, duplicates/replay, multi-socket/device concentration and per-user redial | No | `context-only` | Context only; call metrics may be collected only as a by-product of the raw-event question |
| Actor-callee `4/5 min` | Is pair-scoped protection fair and resistant to harassment without third-party starvation? | Aggregate call/redial outcomes and cost only | Pair concentration, third-party starvation and harassment-versus-redial fairness | No; high-risk pair linkage is required | `omit from first 2A implementation` | Omit |
| Raw call-event — no number | Is aggregate raw handler load/cost material enough to justify a separate raw-event control plane? | Unsampled aggregate phase/stage observations, handler/dependency cost and coarse suppression/error mix | Duplicate/replay attribution, logical attempts and multi-socket actor behavior | Yes; complete-enough 2A evidence can support or reject whether this control should exist, while leaving any numeric value pending | `approval-relevant` | Instrument now as the minimum viable 2A slice |

Only the raw call-event-control existence question is `approval-relevant` under aggregate-only 2A. `Context-only` rows may explain cost or protocol behavior but cannot by themselves move their numeric candidate to approved. Rows marked `omit` must not create counters merely for taxonomy symmetry.

## 5. Candidate Metric And Event Schemas

These are conceptual schemas for later review. They are not implemented names or provider contracts.

### Authorization split

- **Level 2A — aggregate-only instrumentation** may implement only schemas marked 2A. It cannot create actor/session/target linkage, correlation identities, cross-replica actor state or key material.
- **Level 2B — telemetry identity/linkage design + implementation** is a separate future authorization for every schema marked 2B. Level 2A approval does not imply Level 2B approval.

Recommendation after this refinement: consider Level 2A first. Do not present Level 2B for authorization until aggregate-only evidence has been reviewed and a remaining decision question justifies its privacy cost.

### Fixed schema and actual exported-series cardinality registry

Every dimension is a compile/test-visible enum or a bounded runtime vocabulary mapped into a fixed enum. Level 2A duration histograms have a proposed hard maximum of **8 finite buckets**. Under Prometheus exposition, each logical histogram combination therefore expands to `8` finite `_bucket` series + `1` `+Inf` `_bucket` + `_sum` + `_count` = **11 exported series**. This eight-bucket bound is a new Issue #61 planning constraint, not the current repository histogram configuration and not an implementation approval.

`R` is the number of simultaneously scraped backend processes. Prometheus infrastructure labels such as target `instance` distinguish those processes outside the application schema; arbitrary pod, deployment, revision or other runtime labels may not enter the application-controlled dimensions. The repository base Compose declares `R = 3`; the opt-in observability overlay overrides the backend to `R = 1`. These are examples, not a universal deployment guarantee.

| Conceptual Level 2A family | Logical allowed dimension combinations | Metric type | Finite histogram buckets | Max exported series/process | Fleet multiplier | Max fleet series |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `auth_stage_total` | 180 | Counter | N/A | 180 | `R` | `180R` (`540` at `R=3`) |
| `auth_stage_duration_seconds` | 180 | Histogram | 8 | `180 × 11 = 1,980` | `R` | `1,980R` (`5,940` at `R=3`) |
| `friendship_stage_total` | 48 | Counter | N/A | 48 | `R` | `48R` (`144` at `R=3`) |
| `friendship_stage_duration_seconds` | 48 | Histogram | 8 | `48 × 11 = 528` | `R` | `528R` (`1,584` at `R=3`) |
| `call_phase_total` | 40 | Counter | N/A | 40 | `R` | `40R` (`120` at `R=3`) |
| `call_stage_duration_seconds` | 40 | Histogram | 8 | `40 × 11 = 440` | `R` | `440R` (`1,320` at `R=3`) |
| `measurement_dropped_total` | 3 domains × 5 fixed reasons = 15 | Counter | N/A | 15 | `R` | `15R` (`45` at `R=3`) |
| `measurement_handle_anomaly_total` | 3 domains × 3 fixed reasons = 9 | Counter | N/A | 9 | `R` | `9R` (`27` at `R=3`) |
| `measurement_health` | 2 fixed states (`healthy`, `degraded`) | Gauge/state set | N/A | 2 | `R` | `2R` (`6` at `R=3`) |
| `measurement_process_start_time_seconds` | 1 | Gauge | N/A | 1 | `R` | `R` (`3` at `R=3`) |
| `measurement_enabled` | 1 | Gauge | N/A | 1 | `R` | `R` (`3` at `R=3`) |
| `measurement_schema_info` | 1 approved schema/version tuple | Gauge/info | N/A | 1 | `R` | `R` (`3` at `R=3`) |
| **TOTAL MAX LEVEL-2A DESIGNED ENVELOPE** | — | — | — | **3,245** | **`R`** | **`3,245R`; `9,735` at base Compose `R=3`; `3,245` at observability-overlay `R=1`** |

The table uses the full declared maxima. A valid operation-stage manifest may reduce instantiated combinations, but the hard-cardinality test must render the adapter's actual Prometheus schema and assert both the enum/tuple maximum and exporter expansion (`_bucket`, `+Inf`, `_sum`, `_count`). It must also multiply by the configured process count in deployment-plan validation rather than treating logical tuples as physical series.

Level 2B schemas remain conceptual and outside this cardinality/authorization slice:

| Conceptual schema | Level | Fixed dimensions and allowed vocabulary | Measurement semantics | Necessity |
| --- | --- | --- | --- | --- |
| `attempts_per_window` | 2B | 6 reviewed purpose combinations | Unsampled derived histogram; completeness is interval-gated | Actor/network/subject burst evidence |
| `call_phase_gap_seconds` | 2B | 1 phase pair × 4 fixed outcomes | Full observation or later documented unbiased sampling | Cross-phase choreography for one logical attempt |
| `call_events_per_attempt` | 2B | 3 fixed phase sets × 4 outcomes | Unsampled derived histogram; completeness is interval-gated | Duplicate/replay events per correlated logical attempt |

No generic `class`, `operation`, `stage` or `outcome` string is accepted at the external module interface. The conceptual adapters may map typed domain observations to internal descriptors, but callers cannot supply a metric/event name, arbitrary label, tag, path, metadata map or string-to-string dimension.

### Cardinality and semantic-privacy invariant

Every proposed dimension must have a finite reviewed vocabulary, a documented maximum and a test that rejects additions outside the registry. No later dynamic/high-cardinality label may be added without a new privacy/schema review.

Telemetry dimensions and fields must never contain:

- raw URL, request target or arbitrary route/path strings when a route-template enum is sufficient;
- exception/error-message text or arbitrary provider response/error strings;
- IP, user, session, account, target, callee, conversation, call or file identifiers;
- filenames, object keys, HMAC/digest values or dynamic database identifiers;
- JWT, reset/refresh tokens, message content or search content.

Internal telemetry remains security/privacy-sensitive even when it is not user-visible.

### Recovery-safe outcome vocabulary

Recovery metrics use the same coarse three-value stage outcome enum: `continued`, `stopped`, `error`. Queue publication may use only the fixed two-value operational result `accepted` or `error` behind a typed queue-publication operation. No other existence/credential vocabulary is included.

They must not emit `account_exists`, `unknown_account`, `account_missing`, `token_valid`, `token_invalid`, `email_delivered_to_target`, raw provider/account identity or any equivalent target-specific state unless a later explicit privacy decision proves the exact evidence question cannot be answered otherwise.

- Forgot-password route responses remain generic.
- Lookup-work duration may be aggregated without an existence label.
- Queue publication and downstream worker outcomes remain separate, unlinked aggregates.
- No record joins a request to a target, queued job or later completion.

### Minimal event-level candidate

Persistent event-level storage is not justified for auth, recovery, refresh or friendship. Their proposed output is aggregate counters/histograms plus optional short-lived in-memory aggregation if a later linkage gate approves it.

Call logical-attempt correlation is a Level 2B event-like candidate with plausible decision value. It is not part of Level 2A. If Level 2B is later approved, the minimum conceptual record would contain only:

```text
purpose-scoped logical-attempt reference
allowlisted phase
coarse monotonic timestamp
allowlisted outcome
expiry timestamp
```

It must not contain caller/callee IDs, socket IDs, client call IDs, conversation IDs, signal payloads or names. Whether this record may leave process memory or span replicas is unresolved and requires later linkage, implementation and deployment gates.

### Sampling and aggregation strategy

- **Frequency/admission observations are unsampled by contract.** Every eligible request/admission/rejection/stage transition is intended and attempted at its documented observation point; no probabilistic sampling is applied.
- `unsampled != guaranteed complete`. An unsampled counter may be called a **complete count** for an analysis interval only after the explicit measurement-completeness gate below passes. Otherwise it is an incomplete/degraded observation or its completeness is unknown, and it must not be presented as exact request frequency or used as an exact denominator.
- If any later proposal samples frequency/admission observations, it is a schema/analysis-contract change requiring review. The probability and estimator must be explicit, and the result must never be presented as a complete count.
- **Cost/latency evidence may be sampled only under a reviewed bounded proposal.** The rule/probability must be documented and versioned, a known eligible-observation denominator whose interval also passes the completeness gate must be available, and selection must be independent of secret/account/actor/target identity.
- Cost sampling must not systematically exclude errors, slow calls, rare flows or any outcome class. Outcome-stratified sampling requires an explicit estimator/error analysis and schema review.
- Histograms prefer bounded buckets and all-observation aggregation. Any later sampling proposal must document estimator error and keep the sampling configuration out of unbounded runtime labels.
- No actor-, account-, token-, outcome- or target-biased sampling is allowed.
- Event-level persistence is not a sampling mechanism. Call correlation state, if later approved, should remain short-lived and produce aggregate histograms before expiry.
- High-volume raw call-handler timing may be proposed for deterministic, transport-independent sampling only if a later implementation review proves all-observation timing overhead unsafe. No rate is selected here.
- Sampled cost/latency distributions must not directly define a numeric quota. They only describe the consequence/cost of admitted work under the documented estimator.
- Collection windows remain candidate-specific (`14`, `30` or `60` days in the retention matrix) and require a later observation-window gate; they are not permission to collect.

### Measurement-completeness gate

Every proposed analysis window must be classified as exactly one of:

- `complete enough for approved analysis` — every required provenance/health signal is available and satisfies a later use-case-specific acceptance rule;
- `degraded/incomplete` — a known drop, restart, scrape/export gap, backend outage, rollout/disable gap or incompatible schema interval affects the window;
- `unknown` — provenance is insufficient to prove either acceptable completeness or a known bounded gap.

No acceptable completeness percentage is selected here. A future collection/analysis gate must define the rule for its exact evidence question. At minimum, the gate evaluates:

- monotonic `measurement_dropped_total` deltas and sticky `measurement_health` state for every contributing process;
- `measurement_process_start_time_seconds` changes, crashes/restarts and abrupt process termination boundaries;
- exporter/scrape continuity and collection-backend availability;
- deployment/revision binding and rollout intervals, including mixed or missing replicas;
- `measurement_enabled` intervals and any disabled/partially enabled period;
- `measurement_schema_info` compatibility and schema/version cutovers.

A window cannot pass merely because `measurement_dropped_total` did not increase. Crash-before-export, scrape outage, process termination and collector failure can create gaps that the in-process drop counter never observes. Only a passing multi-signal completeness gate permits a count or denominator to be treated as complete for the approved analysis.

### Telemetry fail-inert contract

Measurement is never a correctness or security dependency for the observed flow.

- Adapter/backend failure cannot alter auth, recovery, refresh, friendship or call results.
- Measurement unavailability never produces a user-facing `503`, never maps to `RATE_LIMIT_UNAVAILABLE` and never affects future rate-limit admission.
- Observation failure cannot roll back successful business work, replace/suppress a business error or change a Socket.IO ACK/error.
- No unbounded synchronous retry is permitted. Any retry/buffer proposal requires explicit finite attempts, time and memory bounds at Level 2A/2B review.
- Telemetry work has a documented CPU/time/cardinality bound. The request/event path remains bounded when adapters are slow or unavailable.
- If buffering is later approved, capacity is fixed; overflow drops observations according to an explicit policy and increments a monotonic coarse loss counter when possible. Ordinary drop accounting must continue monotonically; it must not use a deliberately low saturation threshold.
- Telemetry failures cannot recursively produce unbounded logs or metrics. Diagnostic logging, if proposed later, is static, rate-limited, identifier-free and independently bounded.

Loss diagnostics use the monotonic, per-process `measurement_dropped_total{domain,reason}` counter with exactly five `DropReason` values: `invalid_schema`, `invalid_value`, `adapter_unavailable`, `buffer_overflow` and `internal_error`. It contains no identifier, raw payload, exception text or arbitrary reason. Normal counter reset is identified through process-start provenance. The future implementation proposal must document the metrics library/runtime's ordinary numeric overflow behavior rather than intentionally saturating normal drop counts.

If the bounded in-process path reaches a state where loss quantity cannot be represented or exported safely, it sets the fixed sticky state `measurement_health = degraded` for the process lifetime. It must not retain dropped observations, recursively report failure or turn measurement into a business dependency. `measurement_dropped_total` is evidence of known local loss; it cannot prove absence of all measurement loss. Completeness therefore uses the multi-signal gate above.

Limiter enforcement and measurement failure remain distinct:

```text
limiter store unavailable on a fail-closed protected operation
→ RATE_LIMIT_UNAVAILABLE semantics

measurement adapter unavailable
→ business flow continues unchanged; bounded observation loss only
```

## 6. Observation And Censoring Map

### Shared pipeline

```text
edge
→ parser
→ application admission point
→ authentication/token verification
→ actor derivation
→ limiter stage
→ authorization
→ business/dependency work
→ outcome
```

No distributed application limiter exists yet. Every “limiter stage” below is hypothetical and must not be reported as current telemetry.

| Point | Exists today? | Current/proposed observation | Already censored by | Can answer | Cannot answer |
| --- | --- | --- | --- | --- | --- |
| Nginx edge | Config exists; retained qualified data does not | Static config only in this slice | Upstream network/provider not visible | Edge policy/config semantics | Raw demand, deployed behavior or application actor quota |
| HTTP middleware before parser | Yes when metrics enabled | Existing request timer, final route/status class and duration | Nginx; route attribution is absent for parser failures | Backend-reaching route totals and latency | Raw demand; actor cadence; route-specific parser rejects; internal stage cost |
| Current auth route limiter | Login/register/forgot only; process-local | Final HTTP status can include its `429`; no limiter decision metric | Nginx, parser and per-process routing | Current visible reject outcomes | Cluster-wide demand; attempts blocked at other replicas; future Redis semantics |
| Proposed application admission | No | Future aggregate admission/stage counter before expensive work | Edge and parser | Route-reaching attempts at a defined boundary | Raw network demand; final limiter behavior until implemented |
| Auth/provider/crypto stage | Work exists; stage telemetry does not | Future duration/count around allowlisted stages | All upstream points | Aggregate stage cost and continuation | Actor frequency; target/token identity; externally rejected demand |
| Refresh Stage B seam | No approved separate seam | Future point after cryptographic verification and before DB/token issuance | Edge, parser, Stage A and failed verification | Aggregate Stage-B work | Raw refresh demand or active-user validity; subject cadence without linkage |
| Friendship auth/actor point | Auth exists; domain telemetry does not | Future aggregate hook after verified auth and before DB | Edge, parser and auth | Admitted action mix | Other mutation domains or actor rotation without linkage |
| Friendship DB/realtime outcome | Work exists; domain telemetry does not | Future aggregate DB/realtime duration and outcome | Upstream plus validation/authz | Aggregate consequence of actions | Per-user burst or general `state_mutation` policy |
| Socket connection | Yes | Existing active-connection gauge only | Nginx Socket.IO connection control and handshake auth | Connected socket population | Event cadence, actors, phases, retries or raw connection demand |
| `initCall` handler | Yes; no event metric/current app limiter | Future aggregate raw-handler and stage observations | Edge connection control and handshake auth | Handler-reaching `initCall` work | Client emissions rejected before handler; logical attempt without correlation |
| `callUser` handler | Yes; process-local limiter | Future pre/post-current-limiter aggregate observations would require implementation | Edge, handshake and current local limiter after handler entry | Handler events and current local rejection if instrumented later | Cluster logical attempts; `initCall`-only work; raw client emission |
| Call logical-attempt correlation | Existing caller-controlled temp mapping, but no approved measurement identity | Future purpose-specific correlation alternative | Upstream handlers and any failed syntactic validation | Phase gaps, duplicates and replay if approved | Actor/callee fairness unless additional high-risk linkage exists |
| Queue publication | Work exists; no publication metric | Future aggregate `attempted/accepted/error` | Route admission, lookup and current forgot limiter | Backend queue admission consequence | Specific account, delivery or worker result |
| Notification worker outcome | Existing aggregate worker metric family | Existing processed/retried/failed by allowlisted job type | Only published/consumed jobs | Downstream aggregate provider work | Route demand, account existence or request-to-delivery conversion |

### Call-specific Level 2A / Level 2B split

| Question or observation | Level 2A aggregate-only | Level 2B linkage |
| --- | --- | --- |
| Total `initCall` events | Allowed with fixed phase/stage/outcome enums | Not required for total |
| Total `callUser` events | Allowed with fixed phase/stage/outcome enums; current process-local limiter censoring must be documented | Not required for total |
| DB/Redis/signalling cost | Allowed as aggregate bounded histograms without IDs | Not required for aggregate cost |
| Whether `initCall` and `callUser` belong to one logical attempt | Cannot answer | Requires separately approved server-generated logical-attempt correlation |
| Duplicate/replay frequency per attempt | Cannot answer; aggregate phase imbalance is not replay evidence | Requires approved attempt correlation and bounded phase state |
| Multi-socket/device concentration | Cannot answer | Requires approved user/session linkage; separate from attempt correlation |
| Per-user redial distribution | Cannot answer | Requires approved user linkage |
| Actor-callee frequency | Cannot answer | Requires high-risk caller/callee linkage; not recommended for the first 2B proposal |

Level 2A must not create a persistent logical-attempt ID, caller/callee pair reference, socket/user linkage, replay-correlation identity or cross-phase state. Aggregate `initCall` and `callUser` totals must not be presented as logical-attempt counts.

## 7. Privacy And Linkage Alternatives

Invariant:

> `rate-limit enforcement identity != measurement-linkage identity unless separately reviewed and explicitly approved`

Limiter Redis keys, actor keys and limiter HMAC derivation are not measurement identities by default.

### Alternative properties

| Alternative | Evidence enabled | Evidence still impossible | Cross-replica / restart | Retention and expiry | Re-identification/cardinality risk | Secret obligation |
| --- | --- | --- | --- | --- | --- | --- |
| A. Aggregate-only | Route/stage mix, outcomes, durations, queue/DB/provider/signalling cost | Actor bursts, shared NAT, multi-device, phase correlation, pair concentration | Naturally aggregate across scrapes; no identity persistence | Aggregate horizon only; no raw record | Low; bounded label cardinality | None |
| B. Ephemeral process/session correlation | Same-process burst and short sequence summaries | Cross-replica sequences; stable multi-deployment actor cadence; true shared NAT if process changes | No cross-replica; must die on restart | Memory only, minutes to at most one policy window; hard TTL | Medium; cardinality must be bounded and never exported by reference | None if random ephemeral references are process-local; generation still needs implementation review |
| C. Server-generated logical-attempt ID | Call phase sequence, duplicate/replay and phase gap for one attempt | Network/shared-NAT or user-wide cadence unless combined with another identity; target concentration | Cross-replica only with approved shared ephemeral state; restart persistence usually unnecessary | One call lifecycle plus short replay window; TTL required | Medium; reference must never enter metrics labels or exports | No keyed secret necessarily, but random-ID generation/state is a new obligation |
| D. Short-lived purpose-specific keyed pseudonym | Network/user/verified-subject bursts across replicas and restarts within a measurement window | True person count, account-target outcomes and anything outside the scoped purpose | Cross-replica yes; mixed replicas require consistent derivation version | Minimum approved correlation window only; forced rotation and deletion | High; linkability and cardinality abuse remain even without raw IDs | New secret, version, rotation, distribution and access-control obligation |

### Per-question comparison

| Linkage question | A. Aggregate-only | B. Ephemeral process/session | C. Logical-attempt ID | D. Purpose-specific pseudonym | Design disposition |
| --- | --- | --- | --- | --- | --- |
| Auth network bursts/shared NAT | Cost and operation mix only | Partial same-process bursts; weak under load balancing | Not semantically suitable | Could answer network windows, but shared-NAT user count may require a second session linkage | Keep alternatives open; exact shared-NAT user counting may be too invasive |
| Recovery network retries | Aggregate work/queue cost only | Partial retry bursts without durable identity | Not suitable; no safe account-flow ID | Could answer network retries | Prefer aggregate-first; linked recovery evidence needs heightened privacy approval |
| Reset verified-subject frequency | Aggregate post-verification cost only | Partial same-process subject repetition if a safe ephemeral derivation exists | Not suitable | Could answer subject windows but creates sensitive recovery linkage | Do not implement in first slice unless later gate proves decision value exceeds privacy cost |
| Refresh network/subject cadence | Aggregate Stage A/B cost only | Partial bootstrap/session sequences | A server session-attempt ID could link one refresh chain, not actor-wide cadence | Could answer network or verified-subject windows | Keep open; separate network and subject purposes if later approved |
| Friendship actor rotation | Aggregate actions and fan-out only | Same-process actor-window summary | Not suitable | Could answer verified-user windows across replicas | Aggregate-first; pseudonym only if burst evidence remains necessary |
| Call phase/replay/multi-socket | Event totals only | Same-process phase sequence | Best semantic fit for one logical attempt; still not chosen | Could add caller-wide/multi-device cadence but increases privacy | Compare B/C first; D only for actor-wide distribution |
| Actor-callee fairness | Aggregate redial only | Same-process pair summaries remain sensitive/incomplete | Attempt ID cannot establish repeated pair concentration alone | Requires caller+callee purpose linkage and high privacy cost | Drop pair-linkage measurement from the first implementation recommendation; keep candidate pending |

No alternative is selected by this design. Any alternative beyond A requires a separate telemetry identity/linkage authorization gate.

## 8. Retention And Access Matrix

Planning retention classes:

- `R0`: process-memory only, hard TTL no longer than the minimum correlation/policy window; no export.
- `R1`: aggregate metrics, minimum useful horizon 14 days, maximum proposed horizon 30 days before review.
- `R2`: low-cadence aggregate recovery evidence, minimum useful horizon 30 days, maximum proposed horizon 60 days before review.
- `R3`: purpose-linked summary state; not approved. If later approved, raw correlation state uses `R0`, while only non-identifying aggregates may enter `R1`/`R2`.

| Telemetry element | Purpose | Aggregation | Retention class / minimum horizon | Access role | Export restriction | Deletion/expiry | Ongoing value after quota decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HTTP/auth stage totals | Admission/stage mix and coarse outcomes | Global by allowlisted class/operation/stage/outcome | `R1`, 14 days | Security measurement reviewer; operations read-only | Aggregates only; no raw series labels beyond allowlist | Normal aggregate retention expiry | Possible ongoing auth health value; review after decision |
| Stage duration histograms | Provider/crypto/DB/bcrypt/queue/realtime cost | Global histogram | `R1`, 14 days; recovery may use `R2`, 30 days | Security + performance reviewers | Aggregated buckets only | Retention expiry | Ongoing operational value plausible if cardinality remains bounded |
| Recovery queue publication totals | Separate request-side queue admission from worker outcome | Global aggregate, never joined to target/job | `R2`, 30 days | Security/recovery owner | No request/job/target export | Retention expiry | Possible ongoing queue health value |
| Worker email job outcomes | Downstream aggregate provider work | Existing global job type/outcome aggregate | Existing policy; evidence review needs 30-day comparable window if later collected | Operations + security reviewer | Aggregate only | Existing retention plus future explicit collection window | Ongoing operational value exists |
| Attempts-per-window histogram | Legitimate actor/network burst distribution | Exported histogram derived from short-lived linked state | Correlation `R0`; aggregate `R1`/`R2` | Privacy-authorized security reviewers only | No reference/key/digest export | Hard TTL for state; aggregate expiry | One-time threshold value; remove unless operational purpose approved |
| Concurrency histogram | Shared-network/session envelope | Derived aggregate | Correlation `R0`; aggregate `R1` | Privacy-authorized reviewers | No network/session reference export | Hard TTL + aggregate expiry | Likely one-time; candidate to drop |
| Friendship aggregate actions/cost | Validate representative mutation mechanics | Global by action/stage/outcome | `R1`, 14 days | Security + domain owner | No user/relationship identifiers | Retention expiry | Limited ongoing domain health value |
| Call raw phase totals/duration | Evaluate raw handler/evaluator cost | Global by allowlisted phase/stage/outcome | `R1`, 14 days | Security + call owner | No payload/socket/call/callee labels | Retention expiry | Possible ongoing signalling health value |
| Call logical-attempt summaries | Phase sequence, duplicates, replay and gap | Derived histogram; raw state stays `R0` | Correlation `R0`; aggregate `R1`, 30 days | Privacy-authorized security/call reviewers | No attempt reference export | Attempt TTL then aggregate expiry | Review after quota decision; remove if no operational use |
| Actor-callee pair summaries | Pair fairness/harassment | Would require purpose-linked pair state | Not approved | Not applicable | Prohibited in first implementation recommendation | No state should be created | None established |

No actual storage/provider is selected. Any retention backend, access role binding or export path requires future approval.

## 9. Deep Measurement Module And Test Surface

Level 2A, if later approved, should sit behind one deep `Issue61AggregateMeasurementModule` seam. It is bounded to this Issue #61 first slice and is not a generic repository telemetry framework.

### Interface alternatives considered

| Alternative | Depth/locality | Main risk | Disposition |
| --- | --- | --- | --- |
| Two-entry aggregate union (`observeAggregate`, `timeAggregate`) | Smallest interface and high central leverage | A closed union is safe but the generic-looking entry point can invite future scope creep | Useful internal shape, rejected as the external caller interface |
| Domain-specific typed `begin*` methods with inert completion handle | Common caller is simple; compile/test-visible operation-stage mappings; duration hidden | More entry points and enums; callers still choose semantic stage/outcome | **Selected external conceptual contract** |
| Domain-specific record methods plus sealed internal aggregate port | Strongest adapter/schema auditability and structural 2A/2B split | Caller-supplied durations would widen the interface and risk inconsistent timing | Selected as the internal adapter strategy, combined with the completion-handle timing model |

### Revised bounded module contract

The conceptual Level 2A interface is domain-typed:

```text
beginAuthStage(<AuthOperation enum>, <AllowedAuthStage enum>)
  → inert/no-throw completion handle with finish(<AuthOutcome enum>)

beginRecoveryStage(<RecoveryOperation enum>, <AllowedRecoveryStage enum>)
  → inert/no-throw completion handle with finish(<RecoveryOutcome enum>)

beginRefreshStage(<RefreshStage enum>)
  → inert/no-throw completion handle with finish(<RefreshOutcome enum>)

beginFriendshipStage(<FriendshipAction enum>, <FriendshipStage enum>)
  → inert/no-throw completion handle with finish(<FriendshipOutcome enum>)

beginCallStage(<CallEvent enum>, <CallStage enum>)
  → inert/no-throw completion handle with finish(<CallOutcome enum>)
```

Exact code is not approved. The contract means:

- every operation, stage and outcome is a frozen/closed enum with a reviewed operation-stage combination table;
- callers cannot provide event/metric names, route/path strings, labels, tags, metadata maps, provider/error text or arbitrary dimensions;
- callers cannot pass `req`, `socket`, principal/token payloads, limiter keys or any identity/resource value;
- duration uses an internal monotonic clock; callers do not supply timestamps or duration labels;
- `finish` is no-throw, idempotent and emits at most once; disabled/invalid/failed `begin*` returns an inert handle;
- the module invokes no business work and cannot replace, wrap, suppress or rollback the business result;
- schema extension requires code, manifest, cardinality and privacy-negative test changes; there is no runtime plugin/event registration interface.

### Completion and abandonment contract

Every non-inert `begin*` handle must be owned by a completion-safe integration pattern: a reviewed wrapper, `try/catch/finally` discipline or an equivalent lexical lifecycle helper. A naked handle whose lifecycle depends on caller memory is not an approved integration shape.

- A normal return or early return maps to one reviewed bounded domain outcome and finishes once.
- A business exception maps coarsely to `error`, records when the adapter permits, and is rethrown unchanged. Instrumentation may not replace, wrap, suppress or mutate it.
- Request cancellation maps to the existing bounded `stopped` outcome. Socket disconnect/cancellation maps to the existing bounded `suppressed` outcome. No raw cancellation reason, socket state or error text enters telemetry.
- Error, cancellation and disconnect completions observe monotonic duration through the same bounded path as normal completion so failure latency is not systematically omitted.
- The wrapper's `finally` path detects a scope that exits without a reviewed completion and records the fixed anomaly reason `abandoned`; it must not emit a success/normal duration.
- A second completion records only `double_finish`; it does not emit a second business observation.
- An invalid or unmapped completion records only `invalid_completion` and does not turn arbitrary input into a label.
- No design may rely on garbage collection, finalizers or unbounded timeout registries to discover abandonment.

The identifier-free diagnostic family is `measurement_handle_anomaly_total{domain,reason}` with `domain ∈ {auth, friendship, call}` and `reason ∈ {abandoned, double_finish, invalid_completion}`, for at most nine per-process series. It retains no request context and does not recursively report its own failure. The static integration manifest and tests must cover every approved call site so a missing wrapper cannot silently appear successful.

Level 2A has no optional `link_ref`, correlation field, identity type, Redis state, cross-replica actor bucket, pseudonym or key material. Config cannot “upgrade” Level 2A into linkage.

Level 2B must be a separate future module at a separate seam with separate interface, schemas, adapters, configuration and authorization. It must not extend/decorate Level 2A or intercept Level 2A samples. Its interface remains undesigned until a Level 2B gate selects a specific purpose and identity mechanism.

### Internal adapter seam

The module maps validated typed calls into a private sealed aggregate-sample union. The internal aggregate port accepts that union, not `{name, labels, value}` or any free-form object.

Real adapters would be:

- a fixed-catalog aggregate metrics adapter;
- an in-memory capture adapter for interface-level tests;
- a disabled/no-op adapter used by default.

The request/event path performs only bounded in-process work. No remote telemetry backend or Redis call belongs in the Level 2A request path. The in-memory and fixed-catalog adapters make the seam real; generic metrics machinery stays behind the adapter and cannot add dimensions.

The module hides runtime tuple validation, schema-to-descriptor mapping, monotonic timing, unsampled-observation/completeness semantics, reviewed duration sampling, cardinality budgets, bounded drop/health diagnostics, completion safety, disabled behavior and adapter exception isolation.

Friendship remains a deliberately domain-specific interface. It validates instrumentation mechanics only. Its frequency/cost evidence cannot approve group admin, profile, panel mutation, call-history mutation or the `state_mutation` aggregate. Adding another mutation domain requires an explicit scope amendment or later approved slice.

The module interface is the test surface. Future tests must verify allowlists, privacy rejection, disabled behavior, fixed cardinality, stage ordering and fail-inert observation without testing past the interface.

### Validation and test plan for a later implementation proposal

| Test family | Required proof through the module interface |
| --- | --- |
| Schema contract | Only documented class/operation/stage/outcome values are admitted; unknown/free-form labels are dropped safely |
| Privacy-negative | Raw IP/user/account/token/path/resource/socket/call/message/search values cannot enter an adapter, warning or exported label |
| Recovery non-enumeration | Existing generic HTTP response/status/timing contract is not changed by observation; no account-existence, token-validity or target-delivery dimension is emitted |
| Observation ordering | Each hook is demonstrated at the documented point and test fixtures show which upstream rejects are censored |
| Aggregate observation | Counters/histograms receive one intended semantic observation for normal completion, early return, coarse rejection and dependency error cases; interval completeness remains separately gated |
| Completion/abandonment | Normal completion, early return, throw/rethrow, cancellation/disconnect, double finish and missing finish are covered; abandonment cannot appear successful and no finalizer/GC mechanism is used |
| Adapter failure at lifecycle boundaries | Adapter failure during both `begin*` and `finish` returns/uses an inert bounded path, preserves the exact business return/error and records only permitted health evidence when possible |
| Disabled mode | Default-disabled configuration emits nothing, allocates no correlation state and does not alter business outcomes |
| Failure isolation | Adapter/correlation failures are bounded and cannot fail, materially delay or change the HTTP/Socket operation |
| Cardinality | Tests enumerate valid tuples, render the exported schema, include histogram `_bucket`/`+Inf`/`_sum`/`_count` expansion and reject output above the per-process/fleet budget |
| TTL | Any later approved ephemeral state expires at the maximum bound and rejects uncontrolled cardinality growth; Level 2A creates no correlation state |
| Replica/restart | Required only if a later linkage design spans replicas; proves derivation/version consistency, mixed-version behavior and expiry without exporting identities |
| Call choreography | Synthetic handler fixtures cover `initCall`→`callUser`, unmatched phases, duplicates, replay, glare, reconnect and multi-socket semantics without real IDs/payloads |
| Removal | Disable and deletion tests prove no new output/state and expiry/removal of prior temporary state |

An implementation approval checklist must include all rows above, exact schemas and cardinality budgets, config defaults, adapter contracts, retention/access configuration, rollback commands/procedures, deployment evidence requirements and the list of later gates still unapproved.

### Minimum viable Level 2A recommendation

The smallest 2A slice with enough decision value to justify implementation risk is **aggregate call instrumentation only**, bounded to the question: *is raw `initCall`/`callUser` handler load and cost material enough to justify a separate raw-call-event control plane?* Auth and friendship definitions remain Level 1 design only; the first implementation must not create their counters merely to complete the wider taxonomy.

| Required MVP family | Max series/process | Why it can change a future decision |
| --- | ---: | --- |
| `call_phase_total` | 40 | Establishes complete-enough aggregate handler/stage volume and coarse continued/stopped/suppressed/error mix for the raw-event-control existence decision |
| `call_stage_duration_seconds` | 440 | Establishes whether raw handler validation, current local-limit evaluation, DB/Redis work or signalling cost is material; uses at most 8 finite buckets and 11 exported series per logical tuple |
| Call-domain `measurement_dropped_total` | 5 | Can disqualify an interval whose known local loss makes the volume/cost evidence unsafe |
| Call-domain `measurement_handle_anomaly_total` | 3 | Can disqualify an interval or integration whose lifecycle omissions bias failure/duration observations |
| `measurement_health` | 2 | Sticky degradation makes otherwise unrepresentable local loss visible |
| `measurement_process_start_time_seconds` | 1 | Exposes restart boundaries needed by the completeness gate |
| `measurement_enabled` | 1 | Exposes disabled/partially enabled intervals |
| `measurement_schema_info` | 1 | Exposes compatible versus mixed-schema intervals |
| **TOTAL MAX LEVEL-2A FIRST-SLICE SERIES** | **493** | **`493R`; `1,479` at base Compose `R=3`; `493` at observability-overlay `R=1`** |

This MVP can materially support or reject only:

- whether aggregate raw call-handler volume exists at a level that justifies an independent raw-event control;
- whether handler/stage/dependency cost is material enough that raw repeated events create meaningful exhaustion risk;
- whether coarse suppression/error outcomes indicate the proposed control plane is addressing actual handler work rather than a hypothetical path.

It explicitly cannot answer:

- whether `initCall` and `callUser` belong to one logical attempt;
- duplicate/replay attribution, per-user redial cadence, multi-device/multi-socket concentration or actor-callee harassment;
- compatibility of call aggregate `10/min` or actor-callee `4/5 min`;
- any auth, recovery, refresh, friendship, `state_mutation` or other numeric candidate.

No-linkage guarantee: the MVP uses only the fixed call phase/stage/outcome vocabulary and common process health/provenance families. It creates no IP/user/session/socket/callee/call/conversation identifier, pseudonym, digest, logical-attempt reference, cross-replica state or Redis/key material. `Issue61AggregateMeasurementModule` remains the deep module; only its call-domain typed method and common closed diagnostics are in the proposed first implementation surface. Level 2B remains a separate, undesigned module/seam.

Retention expectation: if later deployment and collection gates approve the MVP, call aggregates use `R1` with a minimum useful horizon of 14 days and a maximum proposal of 30 days before review. This design neither starts collection nor selects storage. Analysis requires a `complete enough for approved analysis` interval under the multi-signal gate; degraded or unknown intervals cannot supply an exact frequency/denominator.

Removal/rollback value: the slice stays disabled by default, can stop new output by disabling the Issue #61 module, owns no raw/correlation state to drain, and can be deleted with its call hooks/catalog after the raw-event-control decision. Removal proof must show zero new Issue #61 series, unchanged call ACK/error/business behavior and expiry of prior aggregate data under the approved retention backend. The small call-only surface minimizes rollback risk while preserving a concrete decision outcome.

## 10. Normative Decisions Measurement Cannot Solve

- Whether login's distributed/sliding/admitted-attempt hardening is intentionally accepted.
- Acceptable shared-NAT coupling for auth entry, registration, recovery and refresh.
- Acceptable recovery rejection risk for a security-restoring flow.
- Whether the optional verified reset-subject bucket exists at all.
- Supported tab/device/session bootstrap and refresh behavior.
- Whether friendship actions should share one secondary policy; friendship evidence cannot approve other mutation domains or the state aggregate.
- The definition of one logical call attempt under redial, reconnect and glare.
- Anti-harassment benefit versus legitimate-redial fairness for actor-callee limiting.
- Whether raw call-event control should exist.
- Whether any privacy linkage is proportionate and who is authorized to access it.
- Final numeric approval for every candidate.

## 11. Level 2A And Level 2B Implementation Prerequisites

### Level 2A — aggregate-only instrumentation

A future first 2A gate, if the maintainer later authorizes presenting it, must be limited to the minimum viable call-only slice:

- the bounded `Issue61AggregateMeasurementModule`, fixed enums and valid-combination manifest;
- only the call-domain typed external method plus common closed health/provenance diagnostics;
- fixed-catalog aggregate `initCall`/`callUser` counters and duration histograms without correlation;
- call-domain dropped-measurement and handle-anomaly families;
- the `493` per-process hard first-slice series budget and eight-finite-bucket histogram bound;
- disabled-by-default config, in-memory test adapter and fixed-catalog aggregate adapter;
- privacy-negative, exported-cardinality, completeness/provenance, completion/abandonment, observation-ordering, sampling and fail-inert tests.

Auth/recovery/refresh and friendship schemas remain Level 1 design only. They are not part of the first 2A implementation proposal because their aggregate evidence is context-only for the pending numeric gates. No metric family or counter may be created solely for taxonomy symmetry.

Level 2A must not add pseudonyms, actor/network/session/target/callee linkage, logical-attempt IDs, correlation state, Redis/shared linkage state, cross-replica actor buckets or key material.

### Level 2B — telemetry identity/linkage

A future 2B proposal is separate and must first identify one exact remaining evidence question. It additionally requires explicit decisions for:

- purpose-specific identity/linkage mechanism;
- whether key/secret material exists, plus version, distribution, rotation and destruction;
- minimum correlation lifetime and retention;
- cross-replica and restart semantics;
- bounded state/cardinality, TTL and deletion;
- access roles and re-identification review;
- separate module/interface/seam and adapters;
- proof that disabling/removing 2B leaves 2A and business behavior unchanged.

Level 2B may itself be split into separate purpose decisions for network, verified subject/user and call logical-attempt linkage. Actor-callee linkage remains not recommended for the first linkage proposal.

### Prerequisites shared by later approved implementations

- Exact code, tests, schemas, flags and adapters require approval before modification.
- Retention backend/config and access-role enforcement require deployment approval.
- Changes to metrics, middleware, auth, recovery, refresh, calls or friendship runtime require bounded implementation review.
- Production observation windows, behavioral collection and analysis remain later gates.
- Evidence must bind source/deployment revision and effective configuration before it can inform compatibility.
- Evidence export must remain aggregate and secret-safe.

## 12. Rollback And Removal Plan

| Proposed component | Level | Future enable/disable mechanism | Disable effect | Residual state | Removal verification | Post-policy disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Core aggregate observation hooks | 2A | Disabled-by-default config gate | Stops observation calls or makes module a no-op immediately | None beyond aggregate backend retention | Tests plus zero new series/events after disable | Retain only if ongoing operational value is approved |
| Aggregate metric families | 2A | Catalog/config gate | Stops new samples | Historical aggregates expire per `R1`/`R2` | Catalog absence, scrape output absence and retention expiry evidence | Remove one-time-only families |
| Stage duration hooks | 2A | Per-domain/operation config gate | Stops timers/emission immediately | Aggregate histograms only | No new observations and expired series | Retain only bounded operationally useful stages |
| Ephemeral process/session correlation | 2B | Separate purpose/linkage gate and feature flag | Stops creation; existing entries expire | `R0` memory entries | TTL tests, cardinality zero after maximum TTL | Remove after decision unless explicit ongoing purpose |
| Logical-attempt correlation | 2B | Separate call/linkage gate | Stops new attempt state; existing attempts expire | `R0` process/shared state if later approved | State-key/store count reaches zero; no exported references | Retain only if needed for ongoing call correctness, not just tuning |
| Purpose-specific pseudonym | 2B | Separate secret/linkage/config gate | Stops derivation immediately after coordinated disable | Ephemeral linked state and key material | State expiry/deletion, key revocation/destruction evidence, mixed-version audit | Default remove after evidence window |
| Retention/export configuration | Deployment | Provider-specific deployment gate | Stops writes/exports | Stored aggregates until deletion/expiry | Provider metadata showing expiry/deletion | Remove temporary datasets and access grants |

No rollback action is executed by this design.

## 13. Separate Future Authorization Gates

The following gates are independent and ordered; approval of one does not imply the next:

1. **Level 2A — aggregate-only instrumentation implementation approval** — exact bounded module, fixed schemas/cardinality, hooks, adapters, flags and tests; no linkage or key material. **Approved for the call-only implementation.**
2. **D1 — deployment readiness / target binding** — planning-only proof of exact environment, deployment mechanism, planned immutable source-to-artifact-to-deployed-revision lineage, disabled configuration, topology and rollback mechanism. It does not authorize deployment.
3. **S1 — public-demo security readiness** — resolves Internet-exposure blockers for a public demo without requiring production hardening; it does not authorize deployment or collection.
4. **D2 — inert deployment authorization** — deploys the approved code only while Issue #61 remains disabled; it does not authorize behavioral collection.
5. **C1 — measurement enablement and collection-window authorization** — only after D2's deployment state is known; selects exact enablement, collection, retention, access, provenance/completeness and disable/rollback boundaries.
6. **A1 — production-data analysis authorization** — separate when production aggregate data would be inspected or queried.
7. **Numeric-policy approval** — evaluates only appropriately authorized, provenance-qualified evidence alongside normative security/product decisions.

Level 2B telemetry identity/linkage remains a separate undesigned capability. It is neither prerequisite to nor implied by D1/D2/C1/A1, and needs its own purpose-specific authorization if a future unresolved question justifies it.

No further gate above is approved by this document.

The maintainer selected A in [issue-61-level-2a-call-instrumentation-authorization-gate.md](issue-61-level-2a-call-instrumentation-authorization-gate.md), authorizing only code/test implementation of the locked call-only MVP, then selected D1 **B — Keep Level 2A deployment planning on hold**. The broader auth/friendship 2A envelope remains outside the first implementation because its evidence is context-only. Level 2B is not mature enough and remains on hold until 2A evidence is reviewed and a specific residual question establishes proportionate linkage value. Neither decision authorizes deployment, enablement, behavioral collection, production analysis or numeric-policy work.

## 14. Measurements By Linkage Need

### No identity linkage needed

- Aggregate route/stage counts and coarse outcomes.
- Provider, crypto, DB, bcrypt, queue-publication, worker, realtime/signalling duration and error histograms.
- Aggregate auth operation mix.
- Aggregate friendship action mix and fan-out consequence.
- Aggregate raw call-handler phase/event load and duration.
- Static login semantic compatibility decision.

### Linkage required for the stated question

- Per-network auth/recovery/refresh bursts and shared-NAT fairness.
- Multi-session/tab concurrency behind a network actor.
- Per-verified-subject reset or refresh cadence.
- Per-user friendship route rotation/bursts.
- Call logical-attempt phase correlation, duplicates/replay and multi-socket behavior.
- Actor-callee pair concentration.

### Recommended to drop because privacy cost exceeds first-slice decision value

- Account-target and request-to-reset/recovery-flow linkage.
- Exact shared-NAT unique-person counting; prefer bounded network-window summaries only if later justified.
- Verified reset-subject production linkage unless aggregate downstream cost first proves material value.
- Actor-callee pair telemetry in the first implementation proposal; keep the policy pending and use aggregate redial/product-security evidence.
- Persistent event-level auth/recovery/refresh/friendship records.
- Any reuse of limiter keys, limiter HMACs or business resource identifiers.

## 15. Questions This Design Still Cannot Answer Safely

- Actual deployed traffic rates, percentiles or burst distributions: Level 3 is not authorized and `B = 0`.
- Historical compatibility under a known deployed revision: no provenance-qualified retained source exists.
- Exact number of people behind one network identity without intrusive multi-purpose linkage.
- Whether a specific account exists, received recovery email or completed reset.
- Reset-token validity distribution tied to requests or targets.
- Per-subject reset/refresh cadence without an approved telemetry identity.
- Per-caller/callee harassment concentration without high-risk pair linkage.
- Raw demand rejected before Nginx or before backend route attribution.
- Proposed Redis limiter evaluator capacity before implementation/benchmark authorization.
- Production storage/provider retention and access behavior before provider selection/deployment approval.
- Any final quota number without empirical evidence, normative input and governance approval.

## Terminal State

Historical terminal state: Refined Level 1 design is complete. The maintainer selected A for bounded call-only Level 2A code/test implementation, and the resulting implementation is approved in `docs/security/issue-61-level-2a-call-instrumentation-authorization-gate.md`. D1 was target-ready for S1 consideration. Issue #61 subsequently resolved the S1 security blockers, but this did not grant D2. Current state remains `B = 0`; Level 2B linkage, deployment, enablement, behavioral collection, production analysis and numeric policy remain on hold pending a separate authorization.
