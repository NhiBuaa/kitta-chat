const path = require("node:path");
const { spawn } = require("node:child_process");
const { ensureDemoEnvironment } = require("./demoEnvironment");

const repositoryRoot = path.resolve(__dirname, "..");

function runCommand(
  command,
  args,
  { cwd = repositoryRoot, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function waitForReady(
  url,
  {
    timeoutMs = 180_000,
    intervalMs = 2_000,
    fetchImpl = fetch,
    delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return;
    } catch {}
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const envResult = ensureDemoEnvironment({
    envPath: path.join(repositoryRoot, "server", ".env"),
    templatePath: path.join(repositoryRoot, "server", ".env.example"),
  });
  console.log(
    envResult.created
      ? "Created server/.env with local-only generated secrets."
      : "Using existing server/.env without modifying it.",
  );

  const demoEnvironment = {
    ...process.env,
    COMPOSE_FILE: ["docker-compose.yml", "docker-compose.demo.yml"].join(
      path.delimiter,
    ),
  };
  await runCommand("docker", ["compose", "up", "-d", "--build"], {
    env: demoEnvironment,
  });
  console.log("Waiting for KittaChat readiness...");
  await waitForReady("http://localhost/readyz");
  await runCommand(
    "docker",
    ["compose", "exec", "-T", "backend", "npm", "run", "seed:demo"],
    { env: demoEnvironment },
  );
  console.log("KittaChat demo is ready at http://localhost");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[Demo] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runCommand,
  waitForReady,
};
