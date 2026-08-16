const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

test("observer helper is isolated from runner and raw Docker authority stays outside observer app", () => {
  const compose = parse(fs.readFileSync(path.resolve(__dirname, "../../../docker-compose.k4.yml"), "utf8"));
  const runner = compose.services.runner;
  const observer = compose.services.observer;
  const helper = compose.services["observer-helper"];
  assert.deepEqual(runner.networks, ["k4-workload"]);
  assert.equal(JSON.stringify(runner).includes("K4_OBSERVER_TOKEN"), false);
  assert.equal(JSON.stringify(runner).includes("docker.sock"), false);
  assert.deepEqual(observer.networks, ["k4-observation"]);
  assert.match(observer.image, /K4_OBSERVER_IMAGE/);
  assert.deepEqual(observer.command, ["node", "-e", "setInterval(() => {}, 2147483647)"]);
  assert.equal(JSON.stringify(observer).includes("docker.sock"), false);
  assert.equal(JSON.stringify(observer).includes("ports"), false);
  assert.equal(JSON.stringify(observer).includes("K4_OBSERVER_HELPER_URL"), true);
  assert.equal(JSON.stringify(observer).includes("K4_OBSERVER_TOKEN"), true);
  assert.deepEqual(helper.networks, ["k4-observation", "k4-backend"]);
  assert.equal(helper.volumes.includes("/var/run/docker.sock:/var/run/docker.sock:ro"), true);
  assert.equal(compose.networks["k4-observation"].internal, true);
  assert.equal(JSON.stringify(runner).includes("observer-helper"), false);
  assert.equal(JSON.stringify(runner).includes("k4-observation"), false);
  assert.equal(JSON.stringify(runner).includes("K4_OBSERVER_HELPER_URL"), false);
});
