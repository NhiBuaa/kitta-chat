const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ensureDemoEnvironment } = require("../../scripts/demoEnvironment");

test("demo environment is created safely and an existing file is never overwritten", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kittachat-demo-env-"));
  const templatePath = path.join(directory, ".env.example");
  const envPath = path.join(directory, ".env");
  fs.writeFileSync(
    templatePath,
    [
      "NODE_ENV=development",
      "URL_FRONTEND=http://localhost:5173",
      "MONGO_URI=mongodb://localhost:27017/shot-chat",
      "JWT_SECRET=replace-me",
      "REFRESH_TOKEN_SECRET=replace-me-too",
      "CONVERSATION_SIDEBAR_READ_MODEL_ENABLED=false",
    ].join("\n"),
  );

  const first = ensureDemoEnvironment({
    envPath,
    templatePath,
    randomBytes: () => Buffer.from("0123456789abcdef".repeat(4)),
  });
  const created = fs.readFileSync(envPath, "utf8");
  assert.deepEqual(first, { created: true });
  assert.match(created, /^URL_FRONTEND=http:\/\/localhost$/m);
  assert.match(created, /^MONGO_URI=mongodb:\/\/localhost:27018\/shot-chat$/m);
  assert.match(created, /^CONVERSATION_SIDEBAR_READ_MODEL_ENABLED=true$/m);
  assert.match(created, /^CONVERSATION_PANEL_ENABLED=true$/m);
  assert.match(created, /^CONVERSATION_PANEL_RESOURCES_ENABLED=true$/m);
  assert.doesNotMatch(created, /replace-me/);

  fs.writeFileSync(envPath, `${created}\nCUSTOM_SENTINEL=preserve-me\n`);
  const beforeSecondRun = fs.readFileSync(envPath, "utf8");
  const second = ensureDemoEnvironment({
    envPath,
    templatePath,
    randomBytes: () => Buffer.from("ffffffffffffffff".repeat(4)),
  });

  assert.deepEqual(second, { created: false });
  assert.equal(fs.readFileSync(envPath, "utf8"), beforeSecondRun);
});
