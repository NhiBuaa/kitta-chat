const OPERATIONS = Object.freeze(["metrics", "logs", "stats", "identity", "runner-cgroup"]);
const CGROUP_PATHS = Object.freeze(["cpu.stat", "cpu.max", "cpuset.cpus.effective", "memory.max", "memory.events"]);

function authorizeObservationRequest({ request, activeRun }) {
  if (!request || !activeRun || request.runId !== activeRun.runId || request.project !== activeRun.project) return { allowed: false, reason: "current-run ownership mismatch" };
  if (!OPERATIONS.includes(request.operation)) return { allowed: false, reason: "operation is not observation-only" };
  if (!activeRun.roles?.[request.role]?.includes(request.target)) return { allowed: false, reason: "target is not an allowed resolved role member" };
  if (request.operation === "runner-cgroup" && (request.role !== "runner" || !CGROUP_PATHS.includes(request.path))) return { allowed: false, reason: "cgroup path is not allowlisted" };
  if (request.command || request.dockerArgs || request.filePath) return { allowed: false, reason: "generic command, Docker, and file paths are forbidden" };
  return { allowed: true, principal: `k4-observer:${activeRun.runId}`, policyVersion: "k4-observer-helper-v1" };
}

module.exports = { CGROUP_PATHS, OPERATIONS, authorizeObservationRequest };
