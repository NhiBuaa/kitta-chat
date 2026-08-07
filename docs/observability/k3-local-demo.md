# K3.1 Local Observability Demo

This guide operates the opt-in, loopback-only K3.1 Local Observability Stack. It separates
configuration evidence, runtime health, metric data, Grafana discovery, browser evidence, and
cleanup so one successful command cannot be mistaken for a different claim.

## Scope and safety

- MongoDB remains the durable source of truth. Redis remains cache/coordination only, and
  RabbitMQ remains background-only.
- Grafana is the only published host surface: `http://127.0.0.1:3001`.
- The backend, Prometheus, MongoDB, and Redis ports remain internal to the Compose network.
- The demo traffic calls only the safe successful health route from inside the backend container;
  it does not create users, messages, calls, files, or other business data.
- Do not print `server/.env`, credentials, tokens, connection strings, or generated secret values.
- Browser screenshots/video and README evidence belong to Issue #72, not this slice.

## Evidence layers

### Static configuration

Run from the repository root:

```powershell
npx --yes node@22 --test scripts/ci/k3LocalObservabilityStack.test.cjs
```

This proves profile gating, the Grafana-only loopback port, internal service ports, image pins,
provisioning, the single `backend:3000` scrape target, total request-rate query semantics, and
the fake-Adapter reset contract. It does not prove that a running Prometheus target is healthy
or that Grafana currently has non-empty metric data.

### Bounded startup smoke

```powershell
npm run demo:observability -- start
```

The start action performs environment preflight, starts the isolated `kittachat-k3-1` project,
waits for the MongoDB/Redis/backend/Prometheus/Grafana dependency chain, and confirms Grafana
health plus dashboard provisioning. An existing environment file is not overwritten.

### Prometheus target health and metric data

First create safe traffic:

```powershell
npm run demo:observability -- traffic
```

Then run runtime verification:

```powershell
npm run demo:observability -- verify
```

Verification reports these claims separately:

1. Container/readiness state.
2. The single Prometheus backend target is `UP`.
3. The total HTTP request-rate query returns data.
4. The HTTP latency histogram query returns data.
5. Grafana health is available.
6. The provisioned K3 dashboard is discoverable by UID/title.

The total request-rate claim is distinct from the existing HTTP 5xx rate and 5xx ratio panels.
Static success, target health, query data, and dashboard discovery must not be combined into one
unqualified statement.

### Grafana dashboard discovery

The dashboard is provisioned automatically. No datasource import or dashboard import is needed.
The stable dashboard identity is:

- UID: `kittachat-k3-observability`
- Title: `KittaChat K3 Observability`

Use the `verify` action for the runtime discovery claim. Direct browser observation of non-empty
panels is reserved for Issue #72.

### Safe stop

After evidence capture, run:

```powershell
npm run demo:observability -- stop
```

Safe stop is project-scoped and must never pass `--volumes`. It stops the K3.1 containers and
networks while preserving the exact project-owned volume set. Record the pre-stop and post-stop
volume names when performing manual acceptance.

## Destructive reset is separate

Normal startup, traffic, verification, and manual acceptance never delete volumes. Reset is a
separate two-phase Interface for an explicitly disposable K3.1 environment.

Preview resolves only volumes labeled `com.docker.compose.project=kittachat-k3-1`, prints their
exact names, and returns a target-set digest without deletion:

```powershell
npm run demo:observability -- reset
```

Do not run `reset --confirm <target-set-digest>` during normal manual acceptance; the
confirmation form is intentionally excluded from that flow:

```powershell
npm run demo:observability -- reset --confirm <target-set-digest>
```

Before removal, the command re-resolves the volume names and labels and compares the target-set
digest. A changed set, changed label, foreign volume, stale digest, or invalid digest aborts
before the volume-removal Adapter. Automated contract tests use fake process and volume Adapters
to prove this ordering; do not run the confirmation form against an environment containing data
that has not been explicitly approved for deletion.

## Out of scope

K3.1 does not add Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, new application metrics,
new metric labels/routes, benchmarks, multi-replica discovery, production deployment, browser
evidence, README handoff, or open-ended dashboard tuning.
