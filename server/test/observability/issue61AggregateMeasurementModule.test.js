const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createIssue61AggregateMeasurementModule,
  CALL_PHASE,
  CALL_STAGE,
  CALL_STAGE_MANIFEST,
  CALL_OUTCOME,
  AUTHORIZED_HARD_CEILING_PER_PROCESS,
  MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS,
  calculateManifestMaxExportedSeriesPerProcess,
} = require("../../src/observability/issue61");
const {
  createInMemoryMetricsAdapter,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");

const getObservations = (adapter, metricName) => adapter.snapshot()[metricName] || [];

test("call-only module records one valid typed stage observation with locked labels", () => {
  const adapter = createInMemoryMetricsAdapter();
  let tick = 0n;
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter,
    now: () => {
      tick += 5_000_000n;
      return tick;
    },
  });

  const completion = measurement.beginCallStage(
    CALL_PHASE.CALL_USER,
    CALL_STAGE.SYNTACTIC_VALIDATION,
  );
  completion.finish(CALL_OUTCOME.CONTINUED);

  const snapshot = adapter.snapshot();
  assert.deepEqual(snapshot.kittachat_issue61_call_phase_total, [
    {
      labels: {
        phase: "call_user",
        stage: "syntactic_validation",
        outcome: "continued",
      },
      value: 1,
    },
  ]);
  assert.deepEqual(snapshot.kittachat_issue61_call_stage_duration_seconds, [
    {
      labels: {
        phase: "call_user",
        stage: "syntactic_validation",
        outcome: "continued",
      },
      value: 0.005,
    },
  ]);
  assert.equal(MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS, 397);
});

test("locked manifest derives the 397-series exporter maximum below the 493-series authorization ceiling", () => {
  assert.equal(calculateManifestMaxExportedSeriesPerProcess(), 397);
  assert.equal(MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS, 397);
  assert.equal(AUTHORIZED_HARD_CEILING_PER_PROCESS, 493);
});

test("disabled call-only measurement is inert and registers no samples", () => {
  const adapter = createInMemoryMetricsAdapter();
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: false,
    adapter,
  });

  measurement.beginCallStage(
    CALL_PHASE.CALL_USER,
    CALL_STAGE.SYNTACTIC_VALIDATION,
  ).finish(CALL_OUTCOME.CONTINUED);

  assert.deepEqual(adapter.snapshot(), {});
});

test("each locked manifest phase-stage pair can emit every locked outcome", () => {
  const adapter = createInMemoryMetricsAdapter();
  let tick = 0n;
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter,
    now: () => {
      tick += 5_000_000n;
      return tick;
    },
  });

  Object.entries(CALL_STAGE_MANIFEST).forEach(([phase, stages]) => {
    stages.forEach((stage) => {
      Object.values(CALL_OUTCOME).forEach((outcome) => {
        measurement.beginCallStage(phase, stage).finish(outcome);
      });
    });
  });

  const callCounts = getObservations(adapter, "kittachat_issue61_call_phase_total");
  const durations = getObservations(adapter, "kittachat_issue61_call_stage_duration_seconds");
  assert.equal(callCounts.length, 32);
  assert.equal(durations.length, 32);
  assert.deepEqual(
    new Set(callCounts.map(({ labels }) => `${labels.phase}:${labels.stage}:${labels.outcome}`)),
    new Set(Object.entries(CALL_STAGE_MANIFEST).flatMap(([phase, stages]) => (
      stages.flatMap((stage) => Object.values(CALL_OUTCOME)
        .map((outcome) => `${phase}:${stage}:${outcome}`))
    ))),
  );
});

test("invalid init_call phase-stage pairs are dropped without creating call series", () => {
  const adapter = createInMemoryMetricsAdapter();
  const measurement = createIssue61AggregateMeasurementModule({ enabled: true, adapter });

  [CALL_STAGE.CURRENT_LOCAL_LIMIT, CALL_STAGE.SIGNALLING].forEach((stage) => {
    measurement.beginCallStage(CALL_PHASE.INIT_CALL, stage)
      .finish(CALL_OUTCOME.CONTINUED);
  });

  assert.deepEqual(getObservations(adapter, "kittachat_issue61_call_phase_total"), []);
  assert.deepEqual(getObservations(adapter, "kittachat_issue61_measurement_dropped_total"), [
    {
      labels: { domain: "call", reason: "invalid_schema" },
      value: 1,
    },
    {
      labels: { domain: "call", reason: "invalid_schema" },
      value: 1,
    },
  ]);
  const snapshot = JSON.stringify(adapter.snapshot());
  assert.equal(snapshot.includes(CALL_STAGE.CURRENT_LOCAL_LIMIT), false);
  assert.equal(snapshot.includes(CALL_STAGE.SIGNALLING), false);
});

test("completion lifecycle records double finish and abandonment without a call sample", () => {
  const adapter = createInMemoryMetricsAdapter();
  let tick = 0n;
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter,
    now: () => {
      tick += 1_000_000n;
      return tick;
    },
  });

  const completed = measurement.beginCallStage(
    CALL_PHASE.CALL_USER,
    CALL_STAGE.CURRENT_LOCAL_LIMIT,
  );
  completed.finish(CALL_OUTCOME.SUPPRESSED);
  completed.finish(CALL_OUTCOME.SUPPRESSED);

  measurement.beginCallStage(
    CALL_PHASE.INIT_CALL,
    CALL_STAGE.DB_REDIS_WORK,
  ).abandon();

  assert.deepEqual(getObservations(adapter, "kittachat_issue61_measurement_handle_anomaly_total"), [
    {
      labels: { domain: "call", reason: "double_finish" },
      value: 1,
    },
    {
      labels: { domain: "call", reason: "abandoned" },
      value: 1,
    },
  ]);
  assert.equal(getObservations(adapter, "kittachat_issue61_call_phase_total").length, 1);
});

test("adapter registration and finish failures remain inert to the caller", () => {
  const failedRegistration = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter: {
      registerMetric() {
        throw new Error("adapter unavailable");
      },
      observe() {},
      set() {},
    },
  });

  assert.doesNotThrow(() => {
    failedRegistration.beginCallStage(
      CALL_PHASE.CALL_USER,
      CALL_STAGE.SYNTACTIC_VALIDATION,
    ).finish(CALL_OUTCOME.CONTINUED);
  });

  const adapter = {
    registerMetric() {},
    observe() {
      throw new Error("adapter unavailable");
    },
    set() {},
  };
  const failedFinish = createIssue61AggregateMeasurementModule({ enabled: true, adapter });

  assert.doesNotThrow(() => {
    failedFinish.beginCallStage(
      CALL_PHASE.CALL_USER,
      CALL_STAGE.SYNTACTIC_VALIDATION,
    ).finish(CALL_OUTCOME.ERROR);
  });
});

test("Prometheus output uses exactly the locked histogram expansion and bounded labels", async () => {
  const adapter = createPromClientMetricsAdapter();
  let tick = 0n;
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter,
    now: () => {
      tick += 5_000_000n;
      return tick;
    },
  });

  measurement.beginCallStage(
    CALL_PHASE.CALL_USER,
    CALL_STAGE.SYNTACTIC_VALIDATION,
  ).finish(CALL_OUTCOME.CONTINUED);

  const rendered = await adapter.render();
  const histogramLines = rendered.body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("kittachat_issue61_call_stage_duration_seconds_"));

  assert.equal(histogramLines.filter((line) => line.includes("_bucket{")).length, 9);
  assert.equal(histogramLines.filter((line) => line.includes("_sum{")).length, 1);
  assert.equal(histogramLines.filter((line) => line.includes("_count{")).length, 1);
  assert.equal(rendered.body.includes("userId"), false);
  assert.equal(rendered.body.includes("socketId"), false);
  assert.equal(rendered.body.includes("callId"), false);
});

test("fully populated allowed Prometheus manifest exports exactly 397 series without forbidden init_call pairs", async () => {
  const adapter = createPromClientMetricsAdapter();
  let tick = 0n;
  const measurement = createIssue61AggregateMeasurementModule({
    enabled: true,
    adapter,
    now: () => {
      tick += 5_000_000n;
      return tick;
    },
  });

  Object.entries(CALL_STAGE_MANIFEST).forEach(([phase, stages]) => {
    stages.forEach((stage) => {
      Object.values(CALL_OUTCOME).forEach((outcome) => {
        measurement.beginCallStage(phase, stage).finish(outcome);
      });
    });
  });
  ["invalid_schema", "invalid_value", "adapter_unavailable", "buffer_overflow", "internal_error"]
    .forEach((reason) => {
      adapter.observe("kittachat_issue61_measurement_dropped_total", { domain: "call", reason }, 1);
  });
  ["abandoned", "double_finish", "invalid_completion"].forEach((reason) => {
    adapter.observe("kittachat_issue61_measurement_handle_anomaly_total", { domain: "call", reason }, 1);
  });

  const rendered = await adapter.render();
  const series = rendered.body.split(/\r?\n/).filter((line) => (
    line.startsWith("kittachat_issue61_") && !line.startsWith("#")
  ));
  assert.equal(series.length, MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS);
  assert.equal(series.some((line) => line.includes('phase="init_call",stage="current_local_limit"')), false);
  assert.equal(series.some((line) => line.includes('phase="init_call",stage="signalling"')), false);
});
