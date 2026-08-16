const http = require("node:http");
const { authorizeObservationRequest } = require("./observerHelperPolicy");

function createObserverHelperServer({ token, activeRun, adapters }) {
  if (!token || !activeRun || !adapters) throw new Error("helper token, active run, and adapters are required");
  return http.createServer((req, res) => {
    const operation = req.url?.slice(1);
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        if (req.method !== "POST" || req.headers.authorization !== `Bearer ${token}`) throw Object.assign(new Error("unauthorized"), { status: 401 });
        const request = { ...JSON.parse(body), operation };
        const decision = authorizeObservationRequest({ request, activeRun });
        if (!decision.allowed) throw Object.assign(new Error(decision.reason), { status: 403 });
        const handler = adapters[operation];
        if (typeof handler !== "function") throw Object.assign(new Error("operation unavailable"), { status: 404 });
        const value = await handler(request);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...value, helperIdentity: decision.principal, policyVersion: decision.policyVersion }));
      } catch (error) {
        res.writeHead(error.status || 400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  });
}

module.exports = { createObserverHelperServer };
