# Manual Test Guide: K3.1 Issue #70 Start, Smoke-Test, and Safe Stop

## Metadata

- Feature: K3.1 Local Observability Demo
- Slice: GitHub Issue #70 — start, smoke-test, and safely stop the isolated Local Observability Stack
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- Slice specification: https://github.com/NhiBuaa/kitta-chat/issues/70
- Design reference: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Guide revision: `k3-1-issue-70-v1`
- Drafted at: `2026-08-07T10:16:17.5062005+07:00`
- Approval status: `approved`
- Lock status: `locked`
- Approved by: user
- Approved at: `2026-08-07T10:21:07.1180231+07:00`

## Prerequisites

- Environment: Windows host with PowerShell, Node.js 22, Docker Engine, and Docker Compose 2.24.4 or later.
- Docker state: Docker daemon available; host port `127.0.0.1:3001` free; no unrelated resource uses the fixed project name `kittachat-k3-1`.
- Repository state: run from the repository root with the Issue #70 implementation present.
- Data and state: no business-data seed is required. Existing application projects and their MongoDB, Redis, and RabbitMQ volumes must remain untouched.
- Environment file: either state is valid. If `server/.env` exists, do not display its contents and compare only whether its hash stayed unchanged. If it is missing, the start action may create it atomically and must not print generated values.
- Credentials and permissions: permission to run Docker containers and bind `127.0.0.1:3001`; no Grafana credentials should be required for the loopback-only Viewer flow.
- Safety: do not run the destructive reset action. Cleanup in this guide is `stop` only and must not pass `--volumes`.

## Test-Craft Coverage

Included axes:

- Data shape and contract: missing versus existing environment file; resolved Compose model; pinned image and provisioning contracts.
- State and lifecycle: initial stopped state, start, readiness, provisioned state, safe stop, persisted volumes, and one repeat start/stop cycle.
- Async and concurrency: readiness ordering, bounded waits, failure-stage propagation, and repeated lifecycle commands.
- UI and observable transitions: Grafana health and dashboard discovery through its HTTP Interface; browser visuals are deferred to Issue #72.
- Security and bounds: secret-safe environment handling, Grafana-only published port, internal metrics endpoint, disabled migration flags, project-scoped resources, and non-destructive cleanup.

Omitted axes:

- Business data variants: Issue #70 creates no business data and does not change application schemas or API contracts.
- Prometheus target/query and traffic evidence: owned by blocked Issue #71.
- Browser panel evidence and screenshots/video: owned by blocked Issue #72.
- Destructive reset execution: prohibited during normal acceptance; Issue #71 tests its two-phase contract with fake Adapters.

## Locked Test Cases

### MA-70-01: Focused contract suite covers static and failure behavior

- Purpose: Prove the resolved configuration, environment preflight branches, stage failures, and safe stop contract before starting real containers.
- Steps:
  1. Run `npx --yes node@22 --test scripts/ci/k3LocalObservabilityStack.test.cjs`.
  2. Record the process exit code and complete test summary.
- Expected results:
  - The command exits `0`.
  - Tests cover missing-env creation and existing-env no-overwrite behavior without printing secret values.
  - Tests prove the `observability` profile is opt-in and default Compose/demo behavior is unchanged.
  - Tests prove Grafana is the only published service in the full resolved model and binds exactly to `127.0.0.1:3001:3000`.
  - Tests prove all inherited fixed container names and all non-Grafana published ports are absent.
  - Tests prove the approved image pins, one backend replica, metrics-enabled demo override, disabled migration flags, static scrape target, datasource provisioning, and dashboard provisioning.
  - Fake-Adapter tests prove preflight, Compose, readiness, provisioning, and stop failures exit non-zero with the correct failed stage.
- Evidence to capture:
  - Command, exit code, test count, and test names or summary.
  - No environment contents or generated secret values.

### MA-70-02: Environment preflight preserves the active local state

- Purpose: Prove the real start path does not overwrite an existing environment and does not disclose secrets.
- Steps:
  1. Record whether `server/.env` exists without reading or printing its contents.
  2. If it exists, retain its SHA-256 privately for comparison and do not include the hash in shared evidence.
  3. Run `npm run demo:observability -- start` while capturing stdout, stderr, and exit code.
  4. If the file existed before the command, compare its post-start SHA-256 to the private pre-start value and record only `ENV_UNCHANGED=true|false`.
  5. If the file did not exist, confirm it now exists and record only `ENV_CREATED=true|false`; do not display its contents or delete it as part of this guide.
- Expected results:
  - Start exits `0`.
  - An existing environment file remains byte-for-byte unchanged.
  - A missing environment file is created atomically from the template.
  - Output reports whether the environment was reused or created but contains no JWT, refresh token, credential, connection string, or generated secret value.
- Evidence to capture:
  - Preflight state (`existing` or `missing`), start exit code, and sanitized output.
  - `ENV_UNCHANGED=true` or `ENV_CREATED=true`, without hashes or file contents.

### MA-70-03: Start reaches the bounded K3.1 readiness state

- Purpose: Prove that the advertised start action creates the isolated dependency chain and waits for actual readiness instead of reporting static success.
- Steps:
  1. Use the successful start run from MA-70-02.
  2. Run `docker ps --filter label=com.docker.compose.project=kittachat-k3-1 --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`.
  3. Record the start action's stage output and the project container table.
- Expected results:
  - Required K3.1 containers are running and report their defined ready/healthy state.
  - Start reports successful environment preflight, Compose startup, readiness, and Grafana provisioning as distinct stages.
  - No nginx, RabbitMQ worker, client, or unrelated application container is started by targeting the Grafana dependency chain.
  - Static validation is not used as the readiness claim.
- Evidence to capture:
  - Sanitized stage output and Docker container/status table.
  - No container environment dump or secret-bearing logs.

### MA-70-04: Runtime host surface contains only loopback Grafana

- Purpose: Prove the running stack preserves the local-only host-surface contract.
- Steps:
  1. Run `docker ps --filter label=com.docker.compose.project=kittachat-k3-1 --format "table {{.Names}}\t{{.Ports}}"`.
  2. Inspect only the published-port column for K3.1 containers.
- Expected results:
  - Grafana is the only container with a published port.
  - Grafana shows `127.0.0.1:3001->3000/tcp` or Docker's equivalent rendering.
  - Backend, Prometheus, MongoDB, Redis, and every other K3.1 container show no published host port.
- Evidence to capture:
  - Sanitized K3.1 container/port table.

### MA-70-05: Grafana 12.4.8 provisions the datasource and K3 dashboard

- Purpose: Prove real runtime compatibility for the schema-39 dashboard without manual import.
- Steps:
  1. Request `http://127.0.0.1:3001/api/health` and record status plus non-sensitive version/database fields.
  2. Request `http://127.0.0.1:3001/api/search?query=KittaChat%20K3%20Observability`.
  3. Locate dashboard UID `kittachat-k3-observability` in the response.
- Expected results:
  - Grafana health returns HTTP `200` and identifies runtime `12.4.8`.
  - Dashboard search succeeds without manual datasource or dashboard creation.
  - The result contains title `KittaChat K3 Observability` and UID `kittachat-k3-observability`.
- Evidence to capture:
  - HTTP status, sanitized health fields, and sanitized dashboard UID/title result.

### MA-70-06: Backend metrics and migration runtime flags match the K3.1 override

- Purpose: Prove the internal endpoint is enabled only in the demo backend and migration behavior remains disabled.
- Steps:
  1. Through Docker Compose execution, request `http://127.0.0.1:3000/metrics` from inside the backend container and print only the HTTP status.
  2. Through Docker Compose execution, print only `METRICS_ENABLED`, `CONVERSATION_DUAL_WRITE_ENABLED`, `CONVERSATION_SHADOW_COMPARE_ENABLED`, and `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED` from the backend process environment.
  3. Do not print any other environment variable.
- Expected results:
  - The internal metrics request returns HTTP `200`.
  - `METRICS_ENABLED=true`.
  - All three conversation migration flags are `false`.
  - No secret or connection string appears in output.
- Evidence to capture:
  - Internal metrics status and the four approved non-secret flag values only.

### MA-70-07: Safe stop preserves the exact K3.1 volume set

- Purpose: Prove cleanup stops only the K3.1 project and does not delete its data volumes.
- Steps:
  1. List volumes with label `com.docker.compose.project=kittachat-k3-1`, sort their exact names, and retain the pre-stop list.
  2. Run `npm run demo:observability -- stop` and capture output plus exit code.
  3. Confirm no running container remains with project label `kittachat-k3-1`.
  4. List and sort the same project-labeled volumes again.
  5. Compare the pre-stop and post-stop lists.
- Expected results:
  - Stop exits `0` and does not use `--volumes`.
  - No K3.1 container remains running.
  - The exact project-labeled volume set is unchanged after stop.
  - No volume from another Compose project is listed or changed.
- Evidence to capture:
  - Stop command and exit code.
  - Exact pre-stop and post-stop K3.1 volume names and equality result.
  - Container-count result after stop.

### MA-70-08: One repeat lifecycle reuses state without broadening scope

- Purpose: Cover lifecycle repetition and prove that a second start/stop does not mutate the environment or allocate a different volume set.
- Steps:
  1. Run `npm run demo:observability -- start` again.
  2. Confirm the start action reaches the same bounded readiness state.
  3. Compare the current K3.1 volume names to the post-stop list from MA-70-07.
  4. If `server/.env` existed before MA-70-02, compare its current SHA-256 to the private original and record only `ENV_UNCHANGED=true|false`.
  5. Run `npm run demo:observability -- stop` again.
  6. Confirm no K3.1 container remains and the volume set is still unchanged.
- Expected results:
  - Repeat start and stop both exit `0`.
  - Readiness and provisioning remain successful.
  - The exact K3.1 volume set remains stable.
  - The existing environment remains unchanged.
  - No traffic, Prometheus query, browser-panel evidence, or destructive reset work is introduced in this slice.
- Evidence to capture:
  - Repeat start/stop exit codes, readiness summary, volume equality result, and `ENV_UNCHANGED=true` when applicable.

## Approval Gate

This guide is approved and immutable at revision `k3-1-issue-70-v1`. Any semantic change requires a new guide revision; run observations belong in the separate append-only Evaluation history. Approval unlocks implementation but does not authorize acceptance execution before implementation and required automated tests are green.
