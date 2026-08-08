---
status: accepted
---

# K3.1 local observability demo seam

K3.1 is a time-boxed demo-evidence bridge from K3 observability to K1 portfolio presentation and K6 reproducible demonstration. It is not a new observability workstream. It reuses the MetricsModule, internal `/metrics` endpoint, Prometheus metric contract, Grafana dashboard, and failure boundaries accepted in ADR-012.

## LocalObservabilityDemo Module

`LocalObservabilityDemo` is the deep operational Module. Its external Interface is one command with five actions:

```text
npm run demo:observability -- start
npm run demo:observability -- traffic
npm run demo:observability -- verify
npm run demo:observability -- stop
npm run demo:observability -- reset
npm run demo:observability -- reset --confirm <target-set-digest>
```

The Interface includes these invariants:

- `start` uses the fixed Compose project name `kittachat-k3-1`, safely initializes a missing local environment without overwriting an existing file or printing secrets, activates the `observability` profile, starts only Grafana and its dependency chain, waits for the local stack, and prints the Grafana URL.
- `traffic` sends deterministic safe HTTP requests from inside the Compose network. It does not publish the backend port or create business data.
- `verify` checks container health, the Prometheus backend target, a K3 metric query, Grafana health, and dashboard discovery. It reports each claim separately.
- `stop` performs project-scoped `down` without `--volumes`.
- `reset` without confirmation resolves and validates the K3.1-owned volumes, prints their exact names, performs no deletion, and returns a digest of that target set. `reset --confirm <target-set-digest>` re-resolves the volumes and deletes them only when the project labels and digest still match the disclosed set.
- Every failed action exits non-zero and identifies the failed stage. A static configuration success is never reported as runtime, scrape, query, or browser success.

The implementation hides the Compose file set, profile, project name, health waits, internal service addresses, traffic loop, verification queries, and cleanup arguments. Callers do not assemble raw Compose commands.

The in-process Interface accepts an action and injected process, fetch, clock, and output dependencies. The command-line Adapter uses the real Docker CLI and host network. Tests use fake Adapters at the same seam. Real runtime acceptance uses Docker Compose and the actual HTTP Interfaces.

## Compose and runtime decisions

- The K3.1 overlay is included only by `LocalObservabilityDemo`. Normal Compose and `npm run demo` behavior stays unchanged.
- Prometheus and Grafana belong to the `observability` profile. The start action targets Grafana, which starts Prometheus, the single backend demo replica, and the backend's required MongoDB and Redis dependencies.
- The backend override sets `METRICS_ENABLED=true` and one replica only in the K3.1 Compose file set. The repository example and normal runtime remain disabled by default.
- Grafana is the only published host surface in the resolved K3.1 model and binds as `127.0.0.1:3001:3000`.
- Every non-Grafana service port is removed from the resolved K3.1 model. nginx and RabbitMQ are outside the targeted Grafana dependency chain, and nginx never proxies `/metrics`.
- Prometheus uses one static target, `backend:3000`, with `/metrics` as its metrics path.
- Prometheus is pinned to `prom/prometheus:v3.13.2`, the current patch release of the supported 3.13 LTS line at this decision.
- Grafana is pinned to `grafana/grafana:12.4.8`, a supported 12.4 patch at this decision. Runtime acceptance must prove that the schema-39 dashboard and datasource provisioning work on this runtime.
- Grafana provisions one Prometheus datasource and the existing dashboard from read-only repository mounts. It enables anonymous Viewer access for the loopback-only demo and does not require persistent Grafana state.
- Before invoking Compose, `start` reuses the existing environment initializer's atomic no-overwrite and secret-generation behavior. A missing environment file is created from the repository template; an existing file is left unchanged; secret values are never printed. The overlay keeps conversation migration flags disabled regardless of initializer defaults.
- Prometheus uses a project-scoped data volume. MongoDB and Redis retain their normal Compose volume definitions, which become K3.1-specific under the fixed project name.
- The base Compose file has fixed nginx, MongoDB, Redis, and RabbitMQ container names and publishes nginx, RabbitMQ, and MongoDB ports. The K3.1 overlay uses `!reset null` for every fixed name and `!reset []` for every inherited port sequence. This requires Docker Compose 2.24.4 or later, makes Grafana the sole published service in the resolved K3.1 model, and leaves default Compose behavior unchanged.
- The traffic action executes from inside the backend container and targets a safe successful HTTP operations route. It generates total request-rate and latency samples without exposing a new host port or fabricating a 5xx failure.
- K3.1 permits one bounded dashboard change: add a total HTTP request-rate panel using `kittachat_http_requests_total` without a `status_class="5xx"` filter. The existing 5xx rate and ratio panels remain unchanged; no metric, label, route, or broader dashboard redesign is added.

## Evidence seam

The approved `Local Observability Stack seam` has four evidence layers:

1. Static automation validates the resolved Compose model, profile gating, Grafana-only loopback binding, no published port on any other service, no inherited fixed container name, pinned images, project isolation, datasource/dashboard provisioning, static scrape target, total request-rate query, and metrics-disabled default.
2. Ticket 1 bounded runtime smoke validates missing-env and existing-env preflight, starts the isolated project, waits for required readiness, confirms Grafana provisioning is reachable, records K3.1 volume identities, runs safe stop, and confirms the same volumes remain.
3. Ticket 2 runtime automation validates Prometheus target `UP`, safe traffic, total request-rate and latency query data, Grafana health, and dashboard discovery through the Grafana HTTP Interface.
4. Manual browser acceptance opens Grafana, confirms that no dashboard import is needed, runs the traffic action, and confirms non-empty total HTTP request-rate and HTTP latency series.

Existing K3 metrics, endpoint, dashboard, and boundary tests remain authoritative for application behavior. K3.1 tests the operational Module and running stack; it does not replace or duplicate the MetricsModule tests.

## Repository layout

```text
docker-compose.observability.yml
scripts/
├── observabilityDemo.js
└── ci/
    └── k3LocalObservabilityStack.test.cjs
docs/observability/
├── local/
│   ├── prometheus.yml
│   └── grafana/
│       └── provisioning/
│           ├── dashboards.yml
│           └── datasource.yml
├── k3-local-demo.md
└── demo-evidence/
```

The existing dashboard remains the single dashboard source. Provisioning points to it; K3.1 does not copy or fork the JSON.

## Cleanup safety

Safe cleanup is non-destructive and never passes `--volumes`. It stops and removes only containers and networks owned by `kittachat-k3-1`.

Reset is a separate destructive two-phase action. The preview phase displays the exact K3.1-owned volume names and a digest without deleting anything. Only a later `--confirm <target-set-digest>` invocation may delete; it must re-resolve the set, reject changed targets or foreign labels, and abort before deletion on any mismatch. Tests use fake Adapters to prove no volume-removal command runs before post-disclosure confirmation. Normal automation and manual acceptance do not execute reset.

## Stop rule

K3.1 ends after all of these outcomes pass acceptance:

1. One command starts the Local Observability Stack.
2. One command creates safe HTTP traffic.
3. Grafana provisions the K3 dashboard and shows live total HTTP request-rate and latency data.
4. Two or three screenshots or a short video capture the demo evidence.
5. One command performs safe cleanup without deleting volumes.
6. The project README links to the demo evidence.

After that checkpoint, do not add cAdvisor, Loki, Tempo, OpenTelemetry, Alertmanager, new metrics, benchmark requirements, multi-replica discovery, or open-ended dashboard tuning without a new approved issue.

## Implementation outcome

K3.1 reached this stop rule through Issues #70–#72. The isolated stack, safe traffic and
verification actions, provisioned dashboard, browser acceptance, README handoff, and
non-destructive cleanup all passed their locked acceptance guides with explicit human approval.
The accepted browser artifacts are stored in `docs/assets/readme/k3-observability/`.

Grafana `12.4.8` successfully provisioned and rendered the schema-39 dashboard. PRs #74–#76
delivered the three implementation slices, and PR #77 synchronized the final closure ledger.
No production deployment or destructive reset was performed.

## Rejected alternatives

- Document raw Compose commands as the operator Interface: rejected because project naming, file ordering, verification, and cleanup safety would leak into every caller.
- Extend MetricsModule with local-stack concerns: rejected because container orchestration and evidence capture are not metric observation responsibilities.
- Publish Prometheus for convenience: rejected because Grafana is the only required browser surface and internal verification can use Compose execution.
- Remove fixed container names from the base Compose file: rejected for K3.1 because it changes the default local runtime when an overlay can isolate the demo.
- Copy the complete application Compose model into a standalone K3.1 file: rejected because it would duplicate application dependencies and drift from the normal runtime.
- Persist Grafana state: rejected because repository provisioning reconstructs the datasource and dashboard on every clean start.

## Primary references

- Docker Compose profiles: https://docs.docker.com/compose/how-tos/profiles/
- Docker Compose merge reset: https://docs.docker.com/reference/compose-file/merge/
- Docker port publishing: https://docs.docker.com/engine/network/port-publishing/
- Grafana provisioning: https://grafana.com/docs/grafana/latest/administration/provisioning/
- Grafana support lifecycle: https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/
- Prometheus configuration: https://prometheus.io/docs/prometheus/latest/configuration/configuration/
- Prometheus LTS cycle: https://prometheus.io/docs/introduction/release-cycle/
