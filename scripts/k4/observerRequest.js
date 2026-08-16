const { createObserverHelperClient } = require("./observerHelperClient");
const { validateObserverRequest } = require("./observerRequestContract");

const MAX_REQUEST_BYTES = 64 * 1024;

async function readRequest(input = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of input) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("observer request exceeds the bounded input size");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function executeObserverRequest({ request, env = process.env, helper } = {}) {
  const validated = validateObserverRequest(request, { runId: env.K4_RUN_ID, project: env.K4_PROJECT_NAME });
  const client = helper || createObserverHelperClient({ baseUrl: env.K4_OBSERVER_HELPER_URL, token: env.K4_OBSERVER_TOKEN });
  const method = validated.operation === "runner-cgroup" ? "runnerCgroup" : validated.operation;
  if (typeof client[method] !== "function") throw new Error("typed observer helper operation is unavailable");
  return client[method](validated.payload);
}

async function main() {
  const request = await readRequest();
  const result = await executeObserverRequest({ request });
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`observer request failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { MAX_REQUEST_BYTES, executeObserverRequest, readRequest };
