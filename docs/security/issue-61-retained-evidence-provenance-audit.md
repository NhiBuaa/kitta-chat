# Issue #61 Retained-Evidence Provenance Audit

## Status and authorization

This is the approved read-only, metadata-only provenance audit for auth, recovery and refresh evidence. It does not authorize or contain behavioral values, request counts/rates, latency samples, percentiles, actor/target grouping, raw record inspection, instrumentation, benchmarks or numeric-policy changes.

After the second control-plane audit approval, this artifact was terminology-refined to separate temporal matched-window provenance from revision/deployment binding. Its original evidence result is unchanged.

Audit date: 2026-08-09, Asia/Bangkok. Repository branch: `codex/issue-61-security-baseline-grill`. Repository base revision observed during the audit: `5ff6cd853623f74c311fab71eefab5346e0a0fef`. This revision identifies the local repository state; it is not a deployed-revision claim.

## Audit boundaries and method

The audit inspected only:

- repository source, tests, Compose/Nginx/Prometheus configuration and Git metadata;
- names and schemas of existing metrics/log fields;
- presence of relevant environment key names, without reading or reporting values;
- Docker control-plane availability, without starting containers or reading volumes;
- GitHub deployment, release and workflow-run metadata, without reading runtime artifacts or logs.

Secret-bearing environment/config values were not read or copied. If a metadata interface requires secret values or raw sensitive records, the source remains `requires additional authorization / unsafe metadata interface`.

No `.log`, `.jsonl`, `.ndjson`, Prometheus TSDB or equivalent retained-data file exists in the repository file inventory. Docker metadata was unavailable because the local Docker engine was not running. GitHub returned no Deployment records and no Releases; workflow-run metadata exists for repository revisions, but a successful workflow is not deployment proof.

The repository does not declare log rotation, Docker logging retention or Prometheus TSDB retention. It also does not embed a Git SHA/release identifier into Nginx access logs, backend request logs, application metric labels or startup output. The local `server/.env` exists and contains all relevant config key names checked by this audit; values were not read or reported, so effective runtime overrides remain unknown.

## Provenance inventory

| Source name/type | Evidence questions supported | Exists | Accessible under current authorization | Schema known | Retention/window known | Revision/config provenance | Censoring layers | Privacy/linkage capability | Matched-window compatibility | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nginx access-log stream | Edge admission/rejection presence; edge/backend traffic boundary; request/upstream timing metadata | Configured stream: yes; retained dataset: unknown | Config yes; retained records no | Yes: remote address, request, status, bytes, referer, user agent, request/upstream timing and upstream address | No; no repository rotation/retention policy | Repository config revision recoverable; deployed Nginx revision and effective config unknown | Observation point is Nginx. It can include edge-rejected requests; backend receives only forwarded requests. | Raw IP and request URI are present; reset-password URIs can contain a token. Aggregate use may be possible through a separately authorized controlled query, but raw inspection is prohibited. | No retained window, deployed revision or overlap metadata available | `requires additional access authorization`; `blocked by provenance` |
| Backend HTTP Prometheus metrics | Aggregate auth/recovery/refresh status classes and request duration by route template | Source/schema: yes; retained series: unknown | Source/config yes; retained series no | Yes: method, route template, status class; counter plus duration histogram | No production retention/window evidence. Metrics are disabled by default; local demo retention is not declared. | Metric schema revision recoverable; deployed revision, effective `METRICS_ENABLED`, scrape targets and replica topology unknown | Backend middleware starts after Nginx and before JSON/auth route middleware; edge rejects are absent. Parser/auth failures may lack a resolved route template. | No actor/target labels. Suitable for later aggregate evidence without actor linkage if provenance and access are established. | No qualified Nginx/backend overlap or common deployed revision | `blocked by provenance`; `requires additional access authorization` |
| Backend structured request logs | Aggregate route/status/latency/error context; possible request-level trace under separate authority | Stream schema: yes; retained dataset: unknown | Source/schema yes; retained records no | Yes: request ID, method, raw path, status, latency and sometimes verified user ID | No; stdout retention/logging driver not declared | Source revision recoverable; deployed revision, replica identity and effective logging retention unknown | Starts after Nginx and before parser/auth; final response is logged. Edge-rejected traffic is absent. | Raw path and optional user ID make records sensitive; reset token can appear in the path. Aggregate querying requires controlled access. No actor grouping is authorized. | No qualified overlap, timezone inventory or deployment partition | `requires additional access authorization`; `blocked by provenance` |
| Current process-local auth limiter state | Legacy login/register/forgot fixed-window semantics only | Runtime `Map`: yes; retained stream: no | Static source/tests yes | State shape known; no metric/log schema | Not retained; process lifetime only | Source revision recoverable; per-process runtime state has no release marker | After Nginx and JSON parser; before auth controller for three mounted routes | Legacy raw-XFF/network-key gaps are known. No retained linkage capability exists. | Not applicable | `not useful` for retained measurement; static semantics only |
| Notification-worker structured logs | Password-reset email job processed/retried/failed/DLQ lifecycle; worker reconnect/failure metadata | Stream schema: yes; retained dataset: unknown | Source/schema yes; retained records no | Yes: event, queue, job type, attempt, correlation ID, failure stage and reason | No; worker stdout retention not declared | Source revision recoverable; deployed worker revision, concurrency override and replica count unknown | Observed after forgot-password request admission, queue publish and worker consumption; publish failures before consumption require producer evidence. | Aggregate outcomes do not require actor linkage. Per-request recovery conversion would require correlation linkage and separate approval. | No retained worker window or overlap with backend/Nginx evidence | `requires additional access authorization`; `blocked by provenance` |
| Notification-worker Prometheus queue metrics | Aggregate notification job processed/retried/failed and dead-letter outcomes | Metric objects: yes; retained/exposed source under repository topology: no evidence | Source/schema yes; retained series no | Yes: queue, job type, outcome; dead-letter reason | No | Worker creates an in-process registry, but repository scrape configs target backend HTTP endpoints and expose no worker metrics endpoint | After worker disposition; does not observe producer-side queue failures that never reach the worker | Aggregate labels are identity-free. Actor linkage is not required for queue throughput/outcome evidence. | Cannot match because no repository retention/exposure path is established | `not useful` as a retained source under proven topology; external collector would require separate provenance |
| Email-provider delivery metadata | Provider acceptance/delivery/failure evidence for recovery availability | Repository-retained source: no; external provider source: unknown | No | No retained schema established. `sendMail` returns a message ID, but current worker does not retain it in logs/metrics. | Unknown | Provider/account/config and deployed worker revision unknown | Downstream of worker processing and provider submission | Provider records may contain recipient identifiers and message metadata; raw access is not authorized. Aggregate outcomes could be useful if safely available. | No overlap or time-basis evidence | `requires additional access authorization`; `blocked by provenance` |
| RabbitMQ management/data metadata | Queue topology, current queue state and worker routing configuration | Compose service/volume declaration: yes; actual deployment/runtime: unknown | Static config yes; runtime metadata no | Queue names and retry/DLQ routing known from source | Historical outcome retention not established; persistent messages are not a time-series measurement | Repository topology recoverable; deployed broker revision/config and incident windows unknown | Between producer publish and worker consumption | Aggregate topology/current-state metadata needs no actor linkage. Payload inspection is prohibited. | No qualified runtime window | `usable only as hypothesis` for topology; runtime metadata `requires additional access authorization` |
| Redis operation metrics | Aggregate Redis command success/error and cache fallback evidence | Source/schema: yes; retained series: unknown | Source/config yes; retained series no | Yes: operation/outcome and fallback reason; no auth/limiter labels | Unknown | Source revision recoverable; effective metrics enablement, scrape topology and deployed Redis topology unknown | Backend-side operation seam; not a limiter evaluator or raw dependency-capacity metric | Identity-free aggregate schema; no actor linkage required for generic dependency evidence | No qualified overlap with auth/backend/deployment windows | `blocked by provenance`; `requires additional access authorization` |
| Redis/deployment topology metadata | Single-instance versus cluster atomicity context; backend replica topology | Repository declaration: yes; actual deployment: unknown | Static config yes; runtime metadata no | Yes: one Compose Redis service using `redis:alpine`, AOF/snapshots/volume; Node uses `createClient`; base Compose declares three backend replicas | Runtime interval not applicable; deployment-change history unavailable | Repository revision known. Image is not digest-pinned; effective environment/actual replicas/topology unknown. | Not a traffic observation source | No actor linkage required | Cannot bind static topology to a retained traffic window | `usable only as hypothesis`; production topology `requires additional access authorization` |
| Static K3 scrape contract | Expected three-replica metric schema and infrastructure labels | Yes | Yes | Yes: three static backend roles, `/metrics`, 15-second scrape contract | No retained data; config is explicitly not target-health evidence | Repository revision recoverable; no deployment mapping | Direct backend scrape, bypassing Nginx | Identity-free infrastructure labels | No retained window; contract cannot prove deployed overlap | `usable only as hypothesis` for deployment; usable static contract evidence |
| K3.1 local Prometheus volume/config | Local one-backend demo schema and possible local TSDB persistence | Volume declaration: yes; actual volume: unknown because Docker engine unavailable | Config yes; Docker metadata no | Yes: one backend target and five-second scrape config | Repository does not declare TSDB retention; actual volume dates unavailable | Local-demo config revision recoverable; not a production release | Direct backend scrape; Nginx is outside the demo dependency chain | Identity-free aggregate schema | Cannot assess; local demo is not production compatibility evidence | `not useful` for production compatibility; local schema evidence only |
| GitHub deployment/release/workflow metadata | Deployed revision/release mapping; CI-to-source provenance | Workflow runs: yes; Deployments: no; Releases: no | Yes for returned metadata | Workflow name, head SHA, timestamps, status/conclusion | Workflow metadata window available; no deployment window | Current HEAD has workflow metadata, but no deployment/release record links it to a runtime | Not a traffic source | No actor linkage required | Cannot connect a workflow SHA to Nginx/backend/worker retained windows | `usable only as hypothesis`; `blocked by provenance` for deployment proof |
| Existing source and tests | Current semantics/contracts and schema expectations | Yes | Yes | Yes | Not production-frequency evidence | Current repository revision known; deployed revision unknown | Tests bypass or simulate selected runtime layers according to each test | No actor linkage required for static contract proof | Cannot match to deployment without deployed SHA/release evidence | `usable only as hypothesis` for deployed behavior; static evidence complete |

## Temporal matched-window assessment

This assessment contains only retained runtime source combinations. Static source/tests do not have a production observation window.

| Source combination | Overlap interval | Time basis/timezone | Revision/config/topology continuity | Incident/change partition | Assessment |
| --- | --- | --- | --- | --- | --- |
| Nginx access stream + backend HTTP metrics | Unknown; retained datasets not accessible or proven to exist | Nginx format uses local time with offset; retained Prometheus time basis/window unavailable | Deployed Nginx/backend revisions, effective limits, metrics enablement and replica topology unknown | Unknown | `blocked by provenance`; not compatibility evidence |
| Nginx access stream + backend request logs | Unknown | Nginx timestamp format and backend ISO-UTC logger schema are known, but actual stream clocks/windows are not | No deployed revision or container/replica mapping; Nginx does not log the backend request ID | Unknown | `blocked by provenance`; raw streams also require additional authorization |
| Forgot-password backend route + notification-worker outcomes | Unknown | Backend and worker logger schemas use timestamped structured logs, but retained windows are unknown | Deployed backend/worker revisions, worker count/concurrency and queue config unknown | Unknown | Aggregate matched-window comparison is blocked by provenance; request-to-job linkage is additionally unapproved |
| Backend auth streams + Redis topology/metrics | Unknown | Retained metric/log windows unavailable | Static single-Redis topology cannot be bound to actual deployed topology or changes | Unknown | `hypothesis-only` |

No runtime source combination satisfies the temporal matched-window rule. No observation interval can currently be shown to have overlapping sources, unambiguous time basis, partitioned deployment/config boundaries and identified incident/degraded periods.

## Revision/deployment-binding assessment

| Binding question | Evidence | Missing link | Assessment |
| --- | --- | --- | --- |
| Repository source/tests -> deployed runtime | Current repository revision and static contracts are known | No Deployment/Release record, deployed image/SHA marker or hosting control-plane record | Static source can generate hypotheses; it cannot prove deployed behavior |
| Static Nginx/Compose/Prometheus config -> effective runtime config | Repository config revision is known | No deployed config/image binding or rollout boundary | `blocked by missing revision binding` |
| Runtime datasets -> producing revision/config | Dataset existence and retained metadata are unavailable | Deployed SHA/image/config labels and collector binding | `blocked by missing revision binding` |

## Readiness results

### Safe and ready for later aggregate measurement

None under current authorization and available provenance.

The backend HTTP metric schema, notification queue outcome schema and Redis operation metric schema are privacy-compatible for aggregate evidence because their labels contain no actor/target identifiers. They are not ready because retained-series existence, retention, deployed revision/config and matched windows are unqualified. Nginx and backend request logs could support controlled aggregate queries, but their raw schemas contain IPs, paths/tokens or user IDs and require additional authorization.

### Blocked by missing provenance

- Nginx retained access stream.
- Backend HTTP metric series and structured request logs.
- Notification-worker retained logs and any externally retained queue metrics.
- Email-provider outcome metadata.
- Redis operation metric series and actual Redis topology.
- Deployment/release mapping and all matched-window combinations.

### Blocked by privacy-safe linkage

Final distribution/fairness decisions classified A in the evidence plan remain blocked on an approved privacy-preserving linkage design. This does not block non-linked aggregate evidence classified B or C.

Raw Nginx/backend log inspection is separately prohibited because those schemas can contain IPs, user IDs and reset-token-bearing paths. That access restriction is not evidence that actor linkage is required for aggregate latency/cost evidence.

### Requires additional access authorization

- Production or hosted Nginx log control-plane metadata: dataset existence, retention/window, deployed config/revision and timezone.
- Backend metrics/logging control-plane metadata: metrics enablement, retained-series/log existence, retention, replica labels and deployed SHA.
- Notification-worker log/collector metadata and any worker metrics exposure outside the repository scrape topology.
- Email-provider metadata schema/retention, without recipient or message-level record access.
- Production Redis/RabbitMQ/deployment topology and change/incident metadata.
- Any metadata check that cannot be completed without opening raw production records.

## Revised A/B/C/D/E readiness

- **A — Static evidence complete:** current repository semantics, schemas, tests and declared configuration are known. They do not prove deployed traffic behavior.
- **B — Retained sources provenance-qualified:** none currently qualify for later aggregate measurement.
- **C — Measurement blocked by linkage or instrumentation approval:** candidate-specific. A-class final fairness/distribution claims need approved linkage; B/C aggregate evidence remains useful if provenance/access gates are later satisfied.
- **D — Normative product/security input required:** material for 29 numeric candidates plus the raw call-event policy decision; four numeric candidates currently have no separate normative blocker identified.
- **E — Governance approval:** required for every one of the 33 final numeric policies. Raw call-event first needs policy-existence approval.

## Subsequent audit and next action

The approved second audit is recorded in `docs/security/issue-61-control-plane-provenance-audit-2.md`. It found no source upgrade from `B = 0`.

The next decision is whether the actual hosting/deployment/logging/metrics provider can expose a secret-safe metadata interface. If it cannot, keep `B = 0`; behavioral value extraction, privacy-linkage design and instrumentation remain separate future approval gates.
