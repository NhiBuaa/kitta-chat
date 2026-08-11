# Issue #61 Control-Plane Provenance Audit 2

## Status and authorization

This is the approved second read-only provenance audit. It inspected only safely available control-plane metadata for auth, recovery and refresh evidence. Behavioral data access was not authorized and was not attempted.

Post-audit Decision 2 B is recorded: retained-evidence pursuit stops at `B = 0`. This artifact is terminal provenance evidence unless the maintainer later supplies a concrete provider/source and approves a new authorization gate.

Audit date: 2026-08-09, Asia/Bangkok. Repository branch: `codex/issue-61-security-baseline-grill`. Local repository revision: `5ff6cd853623f74c311fab71eefab5346e0a0fef`. This is a source/build lineage candidate, not a deployed-runtime claim.

## Secret-safety guard applied

- No environment, credential, API-key, token, password, private-key or secret-bearing configuration value was read or copied.
- Configuration properties were treated only as present, absent, unknown or redacted metadata.
- No raw Nginx/backend log, Prometheus series, TSDB, Redis key/data, RabbitMQ payload, email recipient record, build artifact or workflow log was opened.
- GitHub queries selected only non-secret run/job/artifact/environment/package metadata fields.
- The GitHub Packages interface returned `403` because the current token lacks `read:packages`; the audit stopped that source and did not attempt a bypass.

## Safely available control-plane evidence

### GitHub workflow/build lineage

- The latest successful `Docker` workflow metadata inspected is run `31240013651`, triggered by a push to `main` for SHA `5ff6cd853623f74c311fab71eefab5346e0a0fef`, starting at `2026-08-08T04:41:07Z` and completing at `2026-08-08T04:41:52Z`.
- Metadata shows successful server and Nginx build jobs and two unexpired `.dockerbuild` artifacts. Artifact contents were not downloaded or read.
- Static workflow configuration uses `docker/build-push-action` with `push: false` and `load: false` for both images. It declares no registry image name/tag, registry push, deployment job or environment.
- GitHub returned zero repository Environments, zero Deployments and zero Releases.
- These facts bind the workflow run to a source SHA and ephemeral build jobs only. They do not bind any artifact/image to a registry digest or deployed runtime.

### Other control planes

- Local Docker context name is available, but the Docker API is unavailable because the engine is not running. No container, image, volume, start time, replica or effective-config metadata could be read.
- No hosted deployment, Nginx, logging, metrics, Redis, RabbitMQ or email-provider control-plane endpoint/connector is configured in the current agent environment.
- GitHub Packages metadata is not accessible with the current token scope. Even package metadata alone would not establish deployment binding without a deployment/runtime record.

## Revised provenance inventory

`Behavioral data access` is `NOT AUTHORIZED` for every source below.

| Source | Exists | Metadata accessible | Behavioral data access | Retention/window metadata | Timestamp/time basis | Deployment/revision binding quality | Applicable censoring layers | Temporal matched-window capability | Privacy/sensitivity notes | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub Docker workflow run/jobs | Yes | Yes: selected run/job/SHA/timestamp/status metadata | NOT AUTHORIZED | Workflow run timestamps known; not a runtime observation window | GitHub API UTC timestamps | Strong source-SHA-to-workflow binding; no registry/deployment binding | Build control plane only; no runtime traffic | Not a retained runtime source | No secret-bearing step logs or outputs inspected | `hypothesis-only` for deployment; usable build-lineage candidate |
| GitHub `.dockerbuild` artifact metadata | Yes: two metadata records | Yes: name, ID, size, expiry and timestamps only | NOT AUTHORIZED | Artifact created/updated/expiry metadata known | GitHub API UTC timestamps | Bound to workflow run; artifact contents/image digest not inspected; workflow does not push/load images | Build output metadata only | Not a retained runtime source | Artifact download prohibited under current authorization | `blocked by missing revision binding` to registry/deployment |
| GitHub Environments/Deployments/Releases | No records returned | Yes | NOT AUTHORIZED | No records | Not applicable | No deployment/release chain exists in returned metadata | Not a runtime observation source | None | No secret values requested | `not useful` for current deployment binding |
| GitHub Packages/container registry | Unknown | No: current token lacks `read:packages` | NOT AUTHORIZED | Unknown | Unknown | Unknown package/tag/digest lineage | Build/registry control plane only | Not a runtime observation source | Metadata interface authorization insufficient; no bypass attempted | `requires additional authorization` |
| Local Docker control plane | Context exists; engine unavailable | Context name only; Docker API unavailable | NOT AUTHORIZED | Unknown | Unknown | No image/container digest, start time or Compose label available | Would describe local runtime only | None under current availability | No container env, volume content or logs inspected | `blocked by missing revision binding`; `blocked by missing temporal provenance` |
| Actual deployment/hosting control plane | Unknown; no endpoint/connector available | No | NOT AUTHORIZED | Unknown | Unknown | No deployed SHA/image tag/digest or rollout boundary | Would define ingress/runtime topology | None | Secret-safe metadata interface not available | `requires additional authorization` |
| Effective Nginx runtime configuration and log-stream metadata | Static config exists; actual runtime unknown | Static source only | NOT AUTHORIZED | Retention/window unknown | Static log format uses Nginx local-time field; actual stream clock/window unknown | Repository config revision known; deployed Nginx version/config/image binding absent | Nginx edge limit and access logging precede backend | None; actual stream existence/window inaccessible | Access records can contain IP, credential-bearing request target and potentially credential-bearing referrer; raw access prohibited and quarantined for measurement | `blocked by missing revision binding`; `blocked by missing temporal provenance`; `restricted/quarantined for measurement use` |
| Backend metrics/logging control plane | Source schemas exist; actual retained streams unknown | Static source only | NOT AUTHORIZED | Retention/window and effective metrics enablement unknown | Backend logger schema uses ISO UTC; metrics store basis/window unknown | Repository source known; deployed backend SHA/image/replica/config binding absent | Backend observation is downstream of Nginx; controller/downstream evidence is further censored | None; stream existence/window inaccessible | Request logs can contain user ID, credential-bearing reset path and adjacent forgot-password PII; raw logs are quarantined. Metrics labels are aggregate/identity-free. | `blocked by missing revision binding`; `blocked by missing temporal provenance`; raw logs `restricted/quarantined for measurement use` |
| Redis runtime control plane | Static single-service configuration exists; actual runtime topology unknown | Static source only | NOT AUTHORIZED | Runtime/config-change window unknown | Unknown | No actual single/Cluster/Sentinel/node/digest binding | Dependency metadata; not an auth traffic source | Cannot bind topology to an auth observation window | Limiter/cache keys and values were not inspected | `requires additional authorization`; `hypothesis-only` static topology |
| RabbitMQ/notification-worker control plane | Static queue/worker schemas exist; actual runtime/collector unknown | Static source only | NOT AUTHORIZED | Worker log/metric retention and queue-history window unknown | Structured logger schema uses ISO UTC; actual collector basis unknown | No deployed worker SHA/image, replica/concurrency or broker binding | Downstream of request admission, publish and consumption | No backend/worker overlap interval available | No recipient, job payload or correlation record inspected | `blocked by missing revision binding`; `blocked by missing temporal provenance` |
| Email-provider outcome control plane | Unknown | No | NOT AUTHORIZED | Unknown | Unknown | No provider/config/deployed-worker binding | Downstream of worker/provider submission | No queue/provider overlap interval | Recipient/message/provider records may be sensitive | `requires additional authorization` |
| Repository Git/source/tests/config | Yes | Yes | NOT AUTHORIZED | No production observation window | Git commit timestamps only | Strong binding to current repository revision; no deployed-runtime binding | Static semantics only | Not applicable; not a temporal source | Secret values excluded from source evidence | Static evidence complete; deployed claim `hypothesis-only` |

## Temporal matched-window assessment

Temporal matched-window applies only to retained runtime sources. Static source/tests and workflow/build metadata are excluded from this table as observation-window sources.

| Runtime source combination | Stream existence/retention | Overlap interval | Time-basis compatibility | Deployment/config/incident boundaries | Assessment |
| --- | --- | --- | --- | --- | --- |
| Nginx access stream + backend metrics/logs | Unknown | Unknown | Schemas suggest convertible timestamp bases, but actual clocks/windows are unavailable | Unknown | `blocked by missing temporal provenance` |
| Backend auth/recovery stream + notification-worker outcomes | Unknown | Unknown | Backend/worker logger schemas use ISO UTC; actual collectors/windows unavailable | Backend/worker rollout and queue config boundaries unknown | `blocked by missing temporal provenance` |
| Notification-worker outcomes + email-provider outcomes | Unknown | Unknown | Provider basis unknown | Worker/provider config and incident boundaries unknown | `requires additional authorization`; `blocked by missing temporal provenance` |
| Backend auth streams + Redis runtime metrics/topology | Unknown | Unknown | Runtime metric basis unavailable | Redis/backend topology and rollout boundaries unknown | `blocked by missing temporal provenance` |

No temporal source pair is provenance-qualified. No behavioral query was executed to test overlap.

## Revision/deployment-binding assessment

| Binding chain | Evidence obtained | Missing link | Assessment |
| --- | --- | --- | --- |
| Repository SHA -> GitHub Docker workflow | Workflow run metadata names SHA `5ff6cd853623f74c311fab71eefab5346e0a0fef` | None for this build-stage link | Source-to-build candidate confirmed |
| Docker workflow -> build artifacts | Two `.dockerbuild` metadata records and successful job metadata | Artifact contents/image digest not authorized; workflow uses `push: false`, `load: false` | Build metadata only; no distributable-image binding proved |
| Build artifact/image -> registry package/tag/digest | No safe metadata available; Packages API requires `read:packages` | Registry identity/digest and authorization | `requires additional authorization` |
| Registry image -> deployed service/revision | No Deployment/Release/Environment or hosting control-plane record | Actual deployment target, image digest, rollout timestamp | `blocked by missing revision binding` |
| Deployed service -> retained Nginx/backend/worker dataset | No runtime control-plane or retained-stream metadata | Stream labels/collector binding, replicas, effective config and window | `blocked by missing revision binding` and temporal provenance |
| Repository source/tests -> deployed behavior | Current source/test revision known | Deployed SHA/image/config unknown | Static hypothesis only; not compatibility proof |

Workflow SHA is not treated as deployed runtime SHA. No actual deployed revision, image digest, replica count, rollout boundary, load-balancing topology or Redis topology was safely recoverable.

## Static reset-token logging triage

The separate source-only finding is recorded in `docs/security/issue-61-reset-token-logging-triage.md`.

Result: **source-confirmed credential-in-URL design with multiple log exposure sinks; historical persistence/occurrence unverified**. The emailed frontend URL, frontend reset-page request, backend reset API, Nginx `$request`/`$http_referer` fields and backend request/error paths form separate exposure surfaces. Historical occurrence and retention were not inspected. Remediation requires an explicit maintainer scope decision.

## Sources upgraded from B = 0

None.

GitHub workflow/artifact metadata improves build chain-of-custody knowledge but does not provenance-qualify a retained runtime source. `B — retained sources provenance-qualified for later aggregate measurement` remains `0`.

Decision 2 B prevents a third provenance audit, isolated permission requests such as `read:packages`, speculative provider discovery and raw auth/recovery log access. Reopening requires a maintainer-supplied actual provider or concrete secret-safe metadata source plus a new explicit authorization gate.

## Sources still blocked

- Nginx/backend retained streams: missing actual stream existence, retention/window, temporal overlap and deployed revision/config binding; raw records are not authorized.
- Notification-worker/queue/email sources: missing collector/provider existence, retention/window, temporal overlap and worker/provider deployment binding.
- Redis/runtime topology: no accessible control-plane metadata for actual topology or rollout window.
- Local Docker: engine unavailable; no container/image/volume metadata.
- GitHub Packages: current token lacks `read:packages`; interface returned `403`.
- Deployment binding: GitHub has no Environment, Deployment or Release record, and the Docker workflow does not push or load an image.

## Revised A/B/C/D/E readiness

- **A — Static evidence complete:** includes the reset-token logging exposure and source/build workflow lineage. It still does not prove deployed occurrence or traffic behavior.
- **B — Retained sources provenance-qualified:** `0`; no source upgraded.
- **C — Measurement blocked by privacy-safe linkage or instrumentation:** unchanged and candidate-specific. Aggregate B/C evidence remains useful if a source later clears provenance/access gates.
- **D — Normative product/security input required:** unchanged: 29 numeric candidates plus the raw call-event policy decision; four numeric candidates have no separate D blocker identified.
- **E — Governance approval:** unchanged: required for every final numeric policy. The new logging finding separately requires maintainer scope/implementation disposition.

## Recommended next step — do not execute

The human decisions are recorded in `docs/security/issue-61-human-decision-gate.md`. No further provenance action is pending.

Do not run a third provenance audit, request additional permissions, infer a provider, inspect quarantined logs, extract behavioral data or design instrumentation. This stop state does not approve any numeric candidate.
