const crypto = require("node:crypto");

const PARSER_VERSION = "k4-attribution-log-parser-v1";

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

function parseNginxRecords(body) {
  const records = [];
  const diagnostics = [];
  for (const line of String(body || "").split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/upstream=([^ ]+) k4rid=([^ ]+)$/);
    if (!match) { diagnostics.push({ kind: "unparsed", digest: sha256(line) }); continue; }
    const wrapperTimestamp = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+)/)?.[1];
    const accessTimestamp = line.match(/\[([^\]]+)\]/)?.[1];
    let timestamp;
    if (accessTimestamp) {
      const parsed = accessTimestamp.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/);
      if (parsed) {
        const month = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }[parsed[2]];
        const instant = Date.parse(`${parsed[1]} ${parsed[2]} ${parsed[3]} ${parsed[4]} GMT${parsed[5]}`);
        if (month !== undefined && Number.isFinite(instant)) timestamp = new Date(instant).toISOString();
      }
    }
    if (match[2] !== "-") records.push({ upstreamAddr: match[1], requestId: match[2], ...(timestamp ? { timestamp } : {}), ...(wrapperTimestamp ? { wrapperTimestamp } : {}) });
  }
  return { records, diagnostics };
}

function parseBackendRecords(body) {
  const records = [];
  const diagnostics = [];
  for (const line of String(body || "").split(/\r?\n/).filter(Boolean)) {
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0 || !line.includes('"schema":"k4-attribution-v1"')) continue;
    try { records.push(JSON.parse(line.slice(jsonStart))); } catch (_error) { diagnostics.push({ kind: "malformed-k4-record", digest: sha256(line) }); }
  }
  return { records, diagnostics };
}

function reconstructSocketLifecycles(records) {
  const open = new Map();
  const lifecycles = [];
  const diagnostics = [];
  for (const record of records) {
    if (record.event === "socket_authenticated_connect") {
      if (open.has(record.socketId)) diagnostics.push({ kind: "duplicate-connect", socketId: record.socketId });
      else open.set(record.socketId, record);
    } else if (record.event === "socket_disconnect") {
      const connected = open.get(record.socketId);
      if (!connected) diagnostics.push({ kind: "unmatched-disconnect", socketId: record.socketId });
      else {
        lifecycles.push({
          actorRef: connected.actorRef,
          socketId: connected.socketId,
          nodeName: connected.nodeName,
          authenticatedAt: connected.timestamp,
          disconnectedAt: record.timestamp,
          ...(record.timestamp == null ? { disconnectedTimestampMissing: true } : {}),
        });
        open.delete(record.socketId);
      }
    }
  }
  for (const connected of open.values()) lifecycles.push({ actorRef: connected.actorRef, socketId: connected.socketId, nodeName: connected.nodeName, authenticatedAt: connected.timestamp, stillConnectedAtWindowEnd: true });
  return { lifecycles, diagnostics };
}

module.exports = { PARSER_VERSION, parseBackendRecords, parseNginxRecords, reconstructSocketLifecycles, sha256 };
