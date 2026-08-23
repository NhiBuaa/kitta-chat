const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repository = path.resolve(__dirname, "..", "..");
const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) throw new Error("npm_execpath is required for the focused K6 gate");
const commands = [
  {
    command: process.execPath,
    args: [
      "--test",
      "--test-force-exit",
      "test/config/k6PublicDemoEnvironment.test.js",
      "test/capabilityHttpGates.test.js",
      "test/syntheticSignupBoundary.test.js",
      "test/socket/callCapabilityGate.test.js",
      "test/k6AbuseControlContract.test.js",
      "test/rateLimit/policyCatalog.test.js",
      "test/rateLimit/httpAdmission.test.js",
    ],
    cwd: path.join(repository, "server"),
  },
  {
    command: process.env.PYTHON || "python",
    args: ["-m", "unittest", "scripts.test.manual_acceptance.test_record_evaluation"],
    cwd: repository,
  },
  {
    command: process.execPath,
    args: [npmExecutable, "run", "test:k6-target-config"],
    cwd: path.join(repository, "client"),
  },
  {
    command: process.execPath,
    args: ["--test", "scripts/test/k6/capabilityGates.test.cjs"],
    cwd: repository,
  },
];

for (const entry of commands) {
  const result = spawnSync(entry.command, entry.args, {
    cwd: entry.cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
