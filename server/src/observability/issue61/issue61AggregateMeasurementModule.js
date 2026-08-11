const freeze = (value) => Object.freeze(value);

const CALL_PHASE = freeze({
  INIT_CALL: "init_call",
  CALL_USER: "call_user",
});

const CALL_STAGE = freeze({
  HANDLER_ENTRY: "handler_entry",
  SYNTACTIC_VALIDATION: "syntactic_validation",
  CURRENT_LOCAL_LIMIT: "current_local_limit",
  DB_REDIS_WORK: "db_redis_work",
  SIGNALLING: "signalling",
});

const CALL_OUTCOME = freeze({
  CONTINUED: "continued",
  STOPPED: "stopped",
  SUPPRESSED: "suppressed",
  ERROR: "error",
});

const CALL_STAGE_MANIFEST = freeze({
  [CALL_PHASE.INIT_CALL]: freeze([
    CALL_STAGE.HANDLER_ENTRY,
    CALL_STAGE.SYNTACTIC_VALIDATION,
    CALL_STAGE.DB_REDIS_WORK,
  ]),
  [CALL_PHASE.CALL_USER]: freeze([
    CALL_STAGE.HANDLER_ENTRY,
    CALL_STAGE.CURRENT_LOCAL_LIMIT,
    CALL_STAGE.SYNTACTIC_VALIDATION,
    CALL_STAGE.DB_REDIS_WORK,
    CALL_STAGE.SIGNALLING,
  ]),
});

const CALL_DURATION_BUCKETS = freeze([
  0.005,
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  1,
  5,
]);

const DROP_REASON = freeze({
  INVALID_SCHEMA: "invalid_schema",
  INVALID_VALUE: "invalid_value",
  ADAPTER_UNAVAILABLE: "adapter_unavailable",
  BUFFER_OVERFLOW: "buffer_overflow",
  INTERNAL_ERROR: "internal_error",
});

const HANDLE_ANOMALY_REASON = freeze({
  ABANDONED: "abandoned",
  DOUBLE_FINISH: "double_finish",
  INVALID_COMPLETION: "invalid_completion",
});

const METRIC = freeze({
  CALL_PHASE_TOTAL: "kittachat_issue61_call_phase_total",
  CALL_STAGE_DURATION: "kittachat_issue61_call_stage_duration_seconds",
  DROPPED_TOTAL: "kittachat_issue61_measurement_dropped_total",
  HANDLE_ANOMALY_TOTAL: "kittachat_issue61_measurement_handle_anomaly_total",
  HEALTH: "kittachat_issue61_measurement_health",
  PROCESS_START_TIME: "kittachat_issue61_measurement_process_start_time_seconds",
  ENABLED: "kittachat_issue61_measurement_enabled",
  SCHEMA_INFO: "kittachat_issue61_measurement_schema_info",
});

const METRIC_CATALOG = freeze([
  freeze({
    name: METRIC.CALL_PHASE_TOTAL,
    type: "counter",
    labelNames: freeze(["phase", "stage", "outcome"]),
  }),
  freeze({
    name: METRIC.CALL_STAGE_DURATION,
    type: "histogram",
    labelNames: freeze(["phase", "stage", "outcome"]),
    buckets: CALL_DURATION_BUCKETS,
  }),
  freeze({
    name: METRIC.DROPPED_TOTAL,
    type: "counter",
    labelNames: freeze(["domain", "reason"]),
  }),
  freeze({
    name: METRIC.HANDLE_ANOMALY_TOTAL,
    type: "counter",
    labelNames: freeze(["domain", "reason"]),
  }),
  freeze({
    name: METRIC.HEALTH,
    type: "gauge",
    labelNames: freeze(["state"]),
  }),
  freeze({
    name: METRIC.PROCESS_START_TIME,
    type: "gauge",
    labelNames: freeze([]),
  }),
  freeze({
    name: METRIC.ENABLED,
    type: "gauge",
    labelNames: freeze([]),
  }),
  freeze({
    name: METRIC.SCHEMA_INFO,
    type: "gauge",
    labelNames: freeze(["schema_version"]),
  }),
]);

const CALL_DOMAIN = "call";
const SCHEMA_VERSION = "call_2a_v1";
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const HISTOGRAM_SERIES_PER_COMBINATION = CALL_DURATION_BUCKETS.length + 3;

const calculateManifestMaxExportedSeriesPerProcess = () => {
  const callCombinations = Object.values(CALL_STAGE_MANIFEST)
    .reduce((total, stages) => total + stages.length, 0)
    * Object.values(CALL_OUTCOME).length;
  const callCounterSeries = callCombinations;
  const callHistogramSeries = callCombinations * HISTOGRAM_SERIES_PER_COMBINATION;
  const dropSeries = Object.values(DROP_REASON).length;
  const anomalySeries = Object.values(HANDLE_ANOMALY_REASON).length;
  const healthSeries = 2;
  const processStartSeries = 1;
  const enabledSeries = 1;
  const schemaInfoSeries = 1;

  return callCounterSeries + callHistogramSeries + dropSeries + anomalySeries
    + healthSeries + processStartSeries + enabledSeries + schemaInfoSeries;
};

const MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS = calculateManifestMaxExportedSeriesPerProcess();
const AUTHORIZED_HARD_CEILING_PER_PROCESS = 493;

const isValidCallStage = (phase, stage) => CALL_STAGE_MANIFEST[phase]?.includes(stage) === true;
const isValidOutcome = (outcome) => Object.values(CALL_OUTCOME).includes(outcome);

const noopCompletion = freeze({
  finish() {},
  abandon() {},
});

const toSeconds = (startedAt, finishedAt) => {
  const elapsed = finishedAt - startedAt;
  if (typeof elapsed !== "bigint" || elapsed < 0n) return null;
  return Number(elapsed) / NANOSECONDS_PER_SECOND;
};

class Issue61AggregateMeasurementModule {
  constructor({ enabled = false, adapter, now = process.hrtime.bigint } = {}) {
    this.enabled = Boolean(enabled);
    this.adapter = adapter;
    this.now = now;
    this.degraded = false;

    if (!this.enabled) return;

    try {
      if (!adapter || typeof adapter.registerMetric !== "function"
        || typeof adapter.observe !== "function" || typeof adapter.set !== "function") {
        throw new TypeError("Issue61AggregateMeasurementModule requires a complete local adapter");
      }
      METRIC_CATALOG.forEach((definition) => adapter.registerMetric(definition));
      this._setGauge(METRIC.HEALTH, { state: "healthy" }, 1);
      this._setGauge(METRIC.HEALTH, { state: "degraded" }, 0);
      this._setGauge(METRIC.PROCESS_START_TIME, {}, Date.now() / 1000);
      this._setGauge(METRIC.ENABLED, {}, 1);
      this._setGauge(METRIC.SCHEMA_INFO, { schema_version: SCHEMA_VERSION }, 1);
    } catch (error) {
      this.enabled = false;
      this.degraded = true;
    }
  }

  beginCallStage(phase, stage) {
    if (!this.enabled) return noopCompletion;
    if (!isValidCallStage(phase, stage)) {
      this._recordDrop(DROP_REASON.INVALID_SCHEMA);
      return noopCompletion;
    }

    let startedAt;
    try {
      startedAt = this.now();
      if (typeof startedAt !== "bigint") throw new TypeError("Monotonic clock must return bigint");
    } catch (error) {
      this._recordDrop(DROP_REASON.INTERNAL_ERROR);
      return noopCompletion;
    }

    let completed = false;
    return freeze({
      finish: (outcome) => {
        if (completed) {
          this._recordHandleAnomaly(HANDLE_ANOMALY_REASON.DOUBLE_FINISH);
          return;
        }
        completed = true;
        if (!isValidOutcome(outcome)) {
          this._recordHandleAnomaly(HANDLE_ANOMALY_REASON.INVALID_COMPLETION);
          return;
        }

        const durationSeconds = this._finishDuration(startedAt);
        if (durationSeconds === null) return;
        const labels = { phase, stage, outcome };
        const countWritten = this._observe(METRIC.CALL_PHASE_TOTAL, labels, 1);
        const durationWritten = this._observe(METRIC.CALL_STAGE_DURATION, labels, durationSeconds);
        if (!countWritten || !durationWritten) this._recordDrop(DROP_REASON.ADAPTER_UNAVAILABLE);
      },
      abandon: () => {
        if (completed) return;
        completed = true;
        this._recordHandleAnomaly(HANDLE_ANOMALY_REASON.ABANDONED);
      },
    });
  }

  _finishDuration(startedAt) {
    try {
      const durationSeconds = toSeconds(startedAt, this.now());
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
        this._recordDrop(DROP_REASON.INVALID_VALUE);
        return null;
      }
      return durationSeconds;
    } catch (error) {
      this._recordDrop(DROP_REASON.INTERNAL_ERROR);
      return null;
    }
  }

  _observe(name, labels, value) {
    try {
      this.adapter.observe(name, labels, value);
      return true;
    } catch (error) {
      this._setDegraded();
      return false;
    }
  }

  _setGauge(name, labels, value) {
    this.adapter.set(name, labels, value);
  }

  _recordDrop(reason) {
    if (!this.enabled) return;
    try {
      this.adapter.observe(METRIC.DROPPED_TOTAL, { domain: CALL_DOMAIN, reason }, 1);
    } catch (error) {
      this._setDegraded();
    }
  }

  _recordHandleAnomaly(reason) {
    if (!this.enabled) return;
    try {
      this.adapter.observe(METRIC.HANDLE_ANOMALY_TOTAL, { domain: CALL_DOMAIN, reason }, 1);
    } catch (error) {
      this._setDegraded();
    }
  }

  _setDegraded() {
    if (this.degraded) return;
    this.degraded = true;
    try {
      this.adapter.set(METRIC.HEALTH, { state: "healthy" }, 0);
      this.adapter.set(METRIC.HEALTH, { state: "degraded" }, 1);
    } catch (error) {
      // Health reporting is best-effort and must not recurse.
    }
  }
}

const createIssue61AggregateMeasurementModule = (options) => new Issue61AggregateMeasurementModule(options);

module.exports = {
  CALL_DURATION_BUCKETS,
  CALL_OUTCOME,
  CALL_PHASE,
  CALL_STAGE,
  CALL_STAGE_MANIFEST,
  AUTHORIZED_HARD_CEILING_PER_PROCESS,
  calculateManifestMaxExportedSeriesPerProcess,
  DROP_REASON,
  HANDLE_ANOMALY_REASON,
  Issue61AggregateMeasurementModule,
  MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS,
  METRIC,
  METRIC_CATALOG,
  createIssue61AggregateMeasurementModule,
};
