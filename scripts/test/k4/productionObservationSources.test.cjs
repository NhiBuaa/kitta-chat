const test = require("node:test");
const assert = require("node:assert/strict");
const { createProductionObservationSources, parsePrometheusHistogram } = require("../../k4/productionObservationSources");

const plan = { projectName: "kittachat-k4", runId: "run1", workload: { scenario: "sidebar" } };
const metrics = [
  'kittachat_message_persistence_duration_seconds_bucket{outcome="success",le="1"} 2',
  'kittachat_message_persistence_duration_seconds_bucket{outcome="success",le="+Inf"} 2',
  'kittachat_message_persistence_duration_seconds_sum{outcome="success"} 0.2',
  'kittachat_message_persistence_duration_seconds_count{outcome="success"} 2',
].join("\n");

test("production sources use typed helper and keep topology inventory distinct from traffic attribution", async () => {
  const helper = {
    metrics: async () => ({ body: metrics }),
    identity: async ({ target }) => ({ target, containerId: "id" }),
    logs: async () => ({ sourceIdentity: "nginx", sourceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", body: '127.0.0.1 - - [13/Aug/2026:00:00:01 +0000] "GET /api/sidebar/conversations HTTP/1.1" 200 1 "-" "k4" rt=0.1 uct=0.1 uht=0.1 urt=0.1 upstream=10.0.0.1:3000 k4rid=r1', truncated: false, rotationGap: false }),
    stats: async () => ({ helperIdentity: "k4-observer:run1", sample: { CPUPerc: "1%" } }),
    runnerCgroup: async () => ({ cgroupVersion: "v2", memoryEvents: {} }),
  };
  const source = createProductionObservationSources({ helper });
  assert.equal((await source.snapshotPersistenceHistogram({ plan, replica: "backend-1" })).count, 2);
  const inventory = await source.captureTopologyInventory({ plan, point: "before", replicas: ["backend-1"] });
  assert.equal(inventory.evidenceType, "topology-inventory");
  const attribution = await source.captureReplicaAttribution({ plan, replicas: ["backend-1"], measurementStart: "2026-08-13T00:00:00Z", measurementEnd: "2026-08-13T00:00:10Z", measurementOutput: { measuredRequestIds: ["r1"], replicaAddressMap: { "10.0.0.1:3000": "backend-1" } } });
  assert.equal(attribution.topologyNotExercised, true);
  assert.equal(source.identity.dockerManagement, false);
});

test("histogram parser rejects an incomplete metric family", () => {
  assert.throws(() => parsePrometheusHistogram("nothing useful"), /absent or malformed/);
});

test("histogram parser accepts Prometheus label order emitted by prom-client", () => {
  const exposition = [
    'kittachat_message_persistence_duration_seconds_bucket{le="1",outcome="success"} 2',
    'kittachat_message_persistence_duration_seconds_bucket{le="+Inf",outcome="success"} 2',
    'kittachat_message_persistence_duration_seconds_count{outcome="success"} 2',
    'kittachat_message_persistence_duration_seconds_sum{outcome="success"} 0.2',
  ].join("\n");
  assert.deepEqual(parsePrometheusHistogram(exposition), {
    metric: "kittachat_message_persistence_duration_seconds",
    labels: { outcome: "success" },
    buckets: [{ le: "1", count: 2 }, { le: "+Inf", count: 2 }],
    count: 2,
    sum: 0.2,
  });
});

test("production sources fail closed without the typed observer bridge", () => {
  assert.throws(() => createProductionObservationSources(), /injected typed observer bridge/);
});
