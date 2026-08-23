import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createK6TargetConfigBuildEnvironments,
} from "./k6TargetConfigBuildEnvironments.mjs";

const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(clientDirectory, "..");
const distDirectory = resolve(clientDirectory, "dist");
const buildEnvironments = createK6TargetConfigBuildEnvironments();

const run = (args, options = {}) => {
  const result = spawnSync(process.execPath, args, {
    cwd: clientDirectory,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const runExpectedFailure = (args, { env, expectedMessage }) => {
  const result = spawnSync(process.execPath, args, {
    cwd: clientDirectory,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status === 0) {
    console.error("K6 rejected-build contract unexpectedly succeeded");
    process.exit(1);
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!output.includes(expectedMessage)) {
    console.error("K6 rejected-build contract failed for an unexpected reason");
    process.exit(1);
  }
};

const listFiles = async (directory) => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
};

const assertArtifactsExclude = async (value) => {
  const files = await listFiles(distDirectory);
  const contents = await Promise.all(files.map((file) => readFile(file)));
  if (contents.some((content) => content.includes(Buffer.from(value)))) {
    throw new Error("Rejected public-demo input reached a frontend artifact");
  }
};

const viteBuildArgs = [
  resolve(clientDirectory, "node_modules/vite/bin/vite.js"),
  "build",
];

await rm(distDirectory, { force: true, recursive: true });
run(viteBuildArgs, {
  env: buildEnvironments.legacy,
});
run([
  "--test",
  resolve(clientDirectory, "test/config/k6DistContract.test.js"),
]);

await rm(distDirectory, { force: true, recursive: true });
runExpectedFailure(viteBuildArgs, {
  env: buildEnvironments.rejectedPublicDemo,
  expectedMessage: "VITE_DEFAULT_AVATAR is not an approved public-demo build input",
});
await assertArtifactsExclude("K6_FORBIDDEN_VITE_SENTINEL_111");

await rm(distDirectory, { force: true, recursive: true });
run(viteBuildArgs, {
  env: buildEnvironments.validPublicDemo,
});

run([
  "--test",
  resolve(repositoryDirectory, "server/test/config/targetConfiguration.test.js"),
  resolve(repositoryDirectory, "server/test/socketEventsPublisher.test.js"),
  resolve(clientDirectory, "test/config/runtimeConfig.test.js"),
  resolve(clientDirectory, "test/config/runtimeConfigStore.test.js"),
  resolve(clientDirectory, "test/config/RuntimeConfigProvider.test.js"),
  resolve(clientDirectory, "test/config/RuntimeCapabilityGate.test.js"),
  resolve(clientDirectory, "test/config/applicationCapabilityIntegration.test.js"),
  resolve(clientDirectory, "test/config/k6TargetConfigBuildEnvironments.test.js"),
  resolve(clientDirectory, "test/config/sameOriginBuildContract.test.js"),
  resolve(clientDirectory, "test/config/loopbackFixture.test.js"),
  resolve(clientDirectory, "test/config/previewFixtures.test.js"),
  resolve(clientDirectory, "test/config/k6DistContract.test.js"),
  resolve(clientDirectory, "test/config/publicContractPreservation.test.js"),
]);
