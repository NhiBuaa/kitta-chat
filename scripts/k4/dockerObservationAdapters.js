const crypto = require("node:crypto");

const RUN_LABEL = "io.kittachat.k4.run_id";
const PROJECT_LABEL = "com.docker.compose.project";
const K4_PROJECT_LABEL = "io.kittachat.k4.project";
const SERVICE_LABEL = "com.docker.compose.service";
const CGROUP_PATHS = Object.freeze(["cpu.stat", "cpu.max", "cpuset.cpus.effective", "memory.max", "memory.events"]);

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function decodeDockerLogs(value) {
  const body = Buffer.from(value);
  const chunks = [];
  let offset = 0;
  while (offset + 8 <= body.length && (body[offset] === 1 || body[offset] === 2) && body.subarray(offset + 1, offset + 4).every((byte) => byte === 0)) {
    const length = body.readUInt32BE(offset + 4);
    if (offset + 8 + length > body.length) return body;
    chunks.push(body.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return chunks.length && offset === body.length ? Buffer.concat(chunks) : body;
}

function extractTarFile(value) {
  const archive = Buffer.from(value);
  if (archive.length < 512) return archive;
  const sizeText = archive.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
  if (!/^[0-7]+$/.test(sizeText)) return archive;
  const size = Number.parseInt(sizeText, 8);
  if (!Number.isFinite(size) || 512 + size > archive.length) return archive;
  return archive.subarray(512, 512 + size);
}

function createDockerObservationAdapters({ activeRun, engine, fetchFn = fetch, maxLogBytes = 8 * 1024 * 1024 }) {
  if (!activeRun?.targets || !engine?.request) throw new Error("active run targets and Docker Engine transport are required");

  async function ownedTarget(request) {
    const target = activeRun.targets[request.target];
    if (!target || target.role !== request.role) throw new Error("target is not an active-run role member");
    const details = await engine.request({ path: `/containers/${encodeURIComponent(target.id)}/json` });
    const labels = details.Config?.Labels || {};
    if (labels[RUN_LABEL] !== activeRun.runId || labels[K4_PROJECT_LABEL] !== "kittachat-k4" || labels[PROJECT_LABEL] !== activeRun.project || labels[SERVICE_LABEL] !== target.role) {
      throw new Error("container ownership labels contradict the active run");
    }
    return { target, details };
  }

  return {
    async identity(request) {
      const { target, details } = await ownedTarget(request);
      return { containerId: details.Id, role: target.role, addresses: target.addresses || [], labels: { runId: activeRun.runId, project: activeRun.project } };
    },
    async metrics(request) {
      const { target } = await ownedTarget(request);
      if (target.role !== "backend" || !target.addresses?.length) throw new Error("metrics requires a resolved backend observation address");
      const response = await fetchFn(`http://${target.addresses[0]}:3000/metrics`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`internal metrics request failed: ${response.status}`);
      return { body: await response.text(), sourceIdentity: `backend:${target.id}:/metrics` };
    },
    async stats(request) {
      const { target } = await ownedTarget(request);
      const raw = await engine.request({ path: `/containers/${encodeURIComponent(target.id)}/stats?stream=false&one-shot=true` });
      return { sample: { cpuUsageTotal: raw.cpu_stats?.cpu_usage?.total_usage, memoryUsageBytes: raw.memory_stats?.usage }, sourceIdentity: `docker-stats:${target.id}` };
    },
    async logs(request) {
      const { target } = await ownedTarget(request);
      const since = Math.floor(Date.parse(request.measurementStart) / 1000);
      const until = Math.ceil(Date.parse(request.measurementEnd) / 1000);
      if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) throw new Error("valid measurement log window is required");
      const raw = await engine.request({ path: `/containers/${encodeURIComponent(target.id)}/logs?stdout=true&stderr=true&timestamps=true&since=${since}&until=${until}` });
      const decoded = decodeDockerLogs(raw);
      const truncated = decoded.length > maxLogBytes;
      const body = truncated ? decoded.subarray(decoded.length - maxLogBytes) : decoded;
      return { body: body.toString("utf8"), sourceIdentity: `${target.role}:${target.id}:container-logs`, sourceDigest: digest(body), parserVersion: "k4-attribution-v1", truncated, rotationGap: false };
    },
    async "runner-cgroup"(request) {
      const { target } = await ownedTarget(request);
      const paths = request.paths || [];
      if (target.role !== "runner" || paths.some((name) => !CGROUP_PATHS.includes(name))) throw new Error("runner cgroup paths are not fixed and allowlisted");
      const entries = await Promise.all(paths.map(async (name) => {
        const value = extractTarFile(await engine.request({ path: `/containers/${encodeURIComponent(target.id)}/archive?path=${encodeURIComponent(`/sys/fs/cgroup/${name}`)}` }));
        return [name, { content: value.toString("utf8"), sourceDigest: digest(value), sourcePath: `/sys/fs/cgroup/${name}` }];
      }));
      return { cgroupVersion: "v2", sources: Object.fromEntries(entries), sourceIdentity: `runner:${target.id}:cgroup-v2` };
    },
  };
}

module.exports = { CGROUP_PATHS, createDockerObservationAdapters, decodeDockerLogs, extractTarFile };
