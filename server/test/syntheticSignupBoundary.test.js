const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeRegistrationEmail,
} = require("../src/validation/syntheticEmailBoundary");
const {
  createRegistrationController,
} = require("../src/controllers/registrationController");

const identityRows = [
  ["V01", "Visitor@KittaChat.Test", true, "visitor@kittachat.test"],
  ["V02", "visitor@team.kittachat.test", true, "visitor@team.kittachat.test"],
  ["R01", undefined, false],
  ["R02", null, false],
  ["R03", 42, false],
  ["R04", " visitor@kittachat.test", false],
  ["R05", "visitor@kittachat.test ", false],
  ["R06", "visitor @kittachat.test", false],
  ["R07", "visitor\u0009@kittachat.test", false],
  ["R08", "visitor\u200B@kittachat.test", false],
  ["R09", "visitor@kittachat\u3002test", false],
  ["R10", "visitor@kittachat\uFF0Etest", false],
  ["R11", "visitorkittachat.test", false],
  ["R12", "visitor@@kittachat.test", false],
  ["R13", "@kittachat.test", false],
  ["R14", "visitor@test", false],
  ["R15", "visitor@.test", false],
  ["R16", "visitor@kittachat..test", false],
  ["R17", "visitor@-kittachat.test", false],
  ["R18", "visitor@kittachat-.test", false],
  ["R19", "visitor@kittachat.test.", false],
  ["R20", "visitor@example.com", false],
  ["R21", "visitor@kittachat.test.evil", false],
  ["R22", "visitor@kittachattest", false],
  ["R23", "visitor@test.evil", false],
  ["R24", "visitor@*.test", false],
  ["R25", "visitor:opaque@kittachat.test", false],
];

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createHarness = () => {
  const counters = {
    find: 0,
    hash: 0,
    save: 0,
    session: 0,
  };
  const persisted = [];
  class InMemoryUser {
    constructor(input) {
      Object.assign(this, input);
      this._id = "safe-user-id";
    }

    static async findOne() {
      counters.find += 1;
      return null;
    }

    async save() {
      counters.save += 1;
      persisted.push(this.email);
    }
  }

  const register = createRegistrationController({
    userModel: InMemoryUser,
    passwordHasher: {
      async genSalt() {
        return "test-salt";
      },
      async hash() {
        counters.hash += 1;
        return "test-password-hash";
      },
    },
    sessionIssuer(_res, user) {
      counters.session += 1;
      return {
        token: "test-memory-token",
        user: { email: user.email },
      };
    },
  });

  return { counters, persisted, register };
};

const validBody = (email) => ({
  displayName: "Synthetic Visitor",
  email,
  password: "Strong1!Password",
  confirmPassword: "Strong1!Password",
});

test("synthetic-only normalization implements every locked identity row", () => {
  for (const [id, input, accepted, normalized] of identityRows) {
    const result = normalizeRegistrationEmail({ email: input, syntheticOnly: true });
    assert.equal(result.accepted, accepted, id);
    assert.equal(result.normalizedEmail, normalized, id);
    assert.equal(typeof result.rejectionClass, accepted ? "undefined" : "string", id);
  }
});

test("synthetic signup rejects before find, hash, save, or session side effects", async () => {
  for (const [id, input, accepted, normalized] of identityRows) {
    const harness = createHarness();
    const req = {
      app: { get: () => ({ syntheticSignupOnly: true }) },
      body: validBody(input),
    };
    const res = responseRecorder();

    await harness.register(req, res);

    if (accepted) {
      assert.equal(res.statusCode, 201, id);
      assert.deepEqual(harness.persisted, [normalized], id);
      assert.deepEqual(harness.counters, { find: 1, hash: 1, save: 1, session: 1 }, id);
      assert.deepEqual(Object.keys(res.body), ["success", "message", "token", "user"], id);
    } else {
      assert.equal(res.statusCode, 400, id);
      assert.deepEqual(harness.persisted, [], id);
      assert.deepEqual(harness.counters, { find: 0, hash: 0, save: 0, session: 0 }, id);
    }
  }
});

test("explicit local synthetic-only false preserves the existing non-test email path", async () => {
  const pureResult = normalizeRegistrationEmail({
    email: "Visitor@Example.com",
    syntheticOnly: false,
  });
  assert.deepEqual(pureResult, {
    accepted: true,
    normalizedEmail: "visitor@example.com",
  });

  const harness = createHarness();
  const res = responseRecorder();
  await harness.register({
    app: { get: () => ({ syntheticSignupOnly: false }) },
    body: validBody("Visitor@Example.com"),
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(harness.persisted, ["visitor@example.com"]);
});
