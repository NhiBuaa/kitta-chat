const OPTIMIZATION_FIELDS = Object.freeze([
  "profile",
  "workload",
  "dataset",
  "topology",
  "hardware",
  "runnerPlacement",
  "nonTreatmentConfiguration",
]);
const TOPOLOGY_FIELDS = Object.freeze([
  "commit",
  "workload",
  "dataset",
  "hardware",
  "runnerPlacement",
  "nonTreatmentConfiguration",
]);

function valueAt(run, field) {
  if (run?.[field] !== undefined) return run[field];
  const aliases = {
    profile: ["workloadProfile"],
    workload: ["workloadIdentity", "scenario"],
    dataset: ["datasetIdentity"],
    topology: ["topologyIdentity"],
    hardware: ["hardwareLimits", "hardwareIdentity"],
    runnerPlacement: ["testRunnerPlacement"],
    nonTreatmentConfiguration: ["runtimeConfiguration", "configuration"],
    commit: ["commitSha", "commit_sha"],
  };
  return (aliases[field] || []).map((alias) => run?.[alias]).find((value) => value !== undefined);
}

function differences(left, right, fields) {
  return fields.filter((field) => JSON.stringify(valueAt(left, field)) !== JSON.stringify(valueAt(right, field)));
}

function sourceDigest(run) {
  return run?.source_inventory_sha256 || run?.sourceInventorySha256 || run?.sourceDigest || run?.sourceInventory?.sha256 || run?.sourceInventory?.digest;
}

function bundleDigest(run) {
  return run?.bundle_inventory_sha256 || run?.bundleInventorySha256 || run?.bundleDigest || run?.bundleInventory?.sha256 || run?.bundleInventory?.digest;
}

function validateOptimization({ baseline, candidate, bottleneckEvidence, treatment }) {
  const diagnostics = [];
  const changed = differences(baseline, candidate, OPTIMIZATION_FIELDS);
  if (changed.length) diagnostics.push(...changed.map((field) => `undeclared difference: ${field}`));
  if (!sourceDigest(baseline) || !sourceDigest(candidate)) diagnostics.push("baseline and rerun source digests are required");
  if (!bundleDigest(baseline) || !bundleDigest(candidate)) diagnostics.push("baseline and rerun bundle digests are required");
  if (!bottleneckEvidence?.digest) diagnostics.push("bottleneck evidence digest is required");
  const treatments = Array.isArray(treatment) ? treatment : (treatment ? [treatment] : []);
  if (treatments.length !== 1 || !treatments[0]?.name || !treatments[0]?.digest) diagnostics.push("exactly one targeted optimization treatment is required");
  const bottleneckLink = bottleneckEvidence?.runDigest || bottleneckEvidence?.source_inventory_sha256 || bottleneckEvidence?.bundle_inventory_sha256;
  if (bottleneckLink && bottleneckLink !== sourceDigest(baseline) && bottleneckLink !== bundleDigest(baseline)) diagnostics.push("bottleneck evidence is not linked to the baseline provenance");
  const selectedTreatment = treatments[0];
  return {
    status: diagnostics.length ? "REJECTED" : "ACCEPTED",
    experimentType: "optimization",
    allowedDifferences: ["commit", "targetedTreatment"],
    differences: changed,
    diagnostics,
    provenance: { baselineSource: sourceDigest(baseline), candidateSource: sourceDigest(candidate), baselineBundle: bundleDigest(baseline), candidateBundle: bundleDigest(candidate), bottleneckEvidence: bottleneckEvidence?.digest, treatment: selectedTreatment?.digest },
    claimEligibility: diagnostics.length ? { optimization: { eligible: false, reasons: diagnostics } } : { optimization: { eligible: true, reasons: [] } },
  };
}

function validateTopology({ baseline, candidate }) {
  const diagnostics = [];
  const changed = differences(baseline, candidate, TOPOLOGY_FIELDS);
  if (changed.length) diagnostics.push(...changed.map((field) => `undeclared difference: ${field}`));
  const topologyChanged = JSON.stringify(valueAt(baseline, "topology")) !== JSON.stringify(valueAt(candidate, "topology"));
  const replicaChanged = JSON.stringify(valueAt(baseline, "replicaCount")) !== JSON.stringify(valueAt(candidate, "replicaCount"));
  if (!topologyChanged && !replicaChanged) diagnostics.push("topology comparison must vary topology or replica count");
  if (!sourceDigest(baseline) || !sourceDigest(candidate)) diagnostics.push("both component source digests are required");
  if (!bundleDigest(baseline) || !bundleDigest(candidate)) diagnostics.push("both component bundle digests are required");
  return {
    status: diagnostics.length ? "REJECTED" : "ACCEPTED",
    experimentType: "topology",
    allowedDifferences: ["topology", "replicaCount"],
    differences: [...changed, ...(replicaChanged && !changed.includes("replicaCount") ? ["replicaCount"] : [])],
    diagnostics,
    provenance: { baselineSource: sourceDigest(baseline), candidateSource: sourceDigest(candidate), baselineBundle: bundleDigest(baseline), candidateBundle: bundleDigest(candidate) },
    claimEligibility: diagnostics.length ? { topology: { eligible: false, reasons: diagnostics } } : { topology: { eligible: true, reasons: [] } },
  };
}

function validateExperimentComparison({ experimentType, type, baseline, candidate, left, right, bottleneckEvidence, treatment, treatments }) {
  const first = baseline || left;
  const second = candidate || right;
  if (!first || !second) throw new Error("comparison requires baseline and candidate runs");
  const selectedType = experimentType || type;
  if (selectedType === "optimization") return validateOptimization({ baseline: first, candidate: second, bottleneckEvidence, treatment: treatments || treatment });
  if (selectedType === "topology") return validateTopology({ baseline: first, candidate: second });
  throw new Error("comparison experiment type must be optimization or topology");
}

module.exports = {
  OPTIMIZATION_FIELDS,
  TOPOLOGY_FIELDS,
  validateExperimentComparison,
  validateOptimization,
  validateTopology,
};
