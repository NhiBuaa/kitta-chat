const assert = require("node:assert/strict");
const test = require("node:test");
const { parseBackendRecords, parseNginxRecords, reconstructSocketLifecycles } = require("../../k4/attributionLogParser");

test("attribution parser binds nginx correlation/upstream and reconstructs pre-window socket lifetime", () => {
  const nginx = parseNginxRecords('line upstream=10.0.0.2:3000 k4rid=req-1\nline upstream=- k4rid=-');
  assert.deepEqual(nginx.records, [{ upstreamAddr: "10.0.0.2:3000", requestId: "req-1" }]);
  assert.equal(nginx.diagnostics.length, 0);

  const backend = parseBackendRecords([
    '2026-08-12T23:59:59Z {"schema":"k4-attribution-v1","event":"socket_authenticated_connect","actorRef":"actor-1","socketId":"s1","nodeName":"node-a","timestamp":"2026-08-12T23:59:59Z"}',
    '2026-08-13T00:00:05Z {"schema":"k4-attribution-v1","event":"socket_disconnect","actorRef":"actor-1","socketId":"s1","nodeName":"node-a","timestamp":"2026-08-13T00:00:05Z"}',
  ].join("\n"));
  const reconstructed = reconstructSocketLifecycles(backend.records);
  assert.deepEqual(reconstructed.lifecycles, [{ actorRef: "actor-1", socketId: "s1", nodeName: "node-a", authenticatedAt: "2026-08-12T23:59:59Z", disconnectedAt: "2026-08-13T00:00:05Z" }]);
  assert.deepEqual(reconstructed.diagnostics, []);
});

test("malformed relevant attribution record produces completeness diagnostics", () => {
  const parsed = parseBackendRecords('{"schema":"k4-attribution-v1",broken');
  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.diagnostics[0].kind, "malformed-k4-record");
});

test("socket disconnect records without timestamps remain explicitly incomplete", () => {
  const backend = parseBackendRecords([
    '{"schema":"k4-attribution-v1","event":"socket_authenticated_connect","actorRef":"actor-1","socketId":"s1","nodeName":"node-a","timestamp":"2026-08-13T00:00:01Z"}',
    '{"schema":"k4-attribution-v1","event":"socket_disconnect","actorRef":"actor-1","socketId":"s1","nodeName":"node-a"}',
  ].join("\n"));
  const reconstructed = reconstructSocketLifecycles(backend.records);
  assert.equal(reconstructed.lifecycles[0].disconnectedTimestampMissing, true);
});

test("nginx attribution uses access-log event time for window binding and retains Docker wrapper time", () => {
  const parsed = parseNginxRecords('2026-08-14T02:03:10.231586117Z 192.168.160.3 - - [14/Aug/2026:02:03:08 +0000] "GET /api/sidebar/conversations HTTP/1.1" 200 1372 "" "node" rt=0.04 uct=0.00 uht=0.04 urt=0.04 upstream=10.0.0.2:3000 k4rid=req-58');
  assert.deepEqual(parsed.records, [{
    upstreamAddr: "10.0.0.2:3000",
    requestId: "req-58",
    timestamp: "2026-08-14T02:03:08.000Z",
    wrapperTimestamp: "2026-08-14T02:03:10.231586117Z",
  }]);
  assert.deepEqual(parsed.diagnostics, []);
});

test("nginx parser can expose request details for the existing sidebar attribution seam", () => {
  const parsed = parseNginxRecords('2026-08-14T02:03:10.231586117Z 192.168.160.3 - - [14/Aug/2026:02:03:08 +0000] "GET /api/sidebar/conversations?page=1&limit=20 HTTP/1.1" 503 1372 "" "node" rt=0.04 uct=0.00 uht=0.04 urt=0.04 upstream=10.0.0.2:3000 k4rid=req-58', { includeRequestDetails: true });
  assert.deepEqual(parsed.records[0], {
    upstreamAddr: "10.0.0.2:3000",
    requestId: "req-58",
    method: "GET",
    path: "/api/sidebar/conversations",
    status: 503,
    timestamp: "2026-08-14T02:03:08.000Z",
    wrapperTimestamp: "2026-08-14T02:03:10.231586117Z",
  });
});

test("nginx parser ignores unbound access traffic but diagnoses malformed measured bindings", () => {
  const parsed = parseNginxRecords([
    "line without a k4 binding",
    "line upstream=10.0.0.2:3000 k4rid=req-1",
  ].join("\n"), { includeRequestDetails: true });
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.diagnostics[0].kind, "malformed-request-line");
});
