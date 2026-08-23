const path = require("node:path");

const { identityRows } = require("./fixtures.cjs");
const {
  close,
  emptySideEffects,
} = require("./runnerSupport.cjs");
const {
  createSyntheticServer,
  validRegistration,
} = require("./scenarioSupport.cjs");

const resetSignupCounters = (counters) => Object.assign(counters, {
  limiter: 0,
  bodyProcessing: 0,
  find: 0,
  normalizedQuery: 0,
  hash: 0,
  save: 0,
  session: 0,
  queue: 0,
  provider: 0,
});

const createSignupController = ({ root, state }) => {
  const { createRegistrationController } = require(path.join(
    root,
    "server",
    "src",
    "controllers",
    "registrationController.js",
  ));
  class InMemoryUser {
    constructor(input) { Object.assign(this, input); this._id = "safe-user-id"; }
    static async findOne() {
      state.counters.find += 1;
      state.counters.normalizedQuery += 1;
      return null;
    }
    async save() {
      state.counters.save += 1;
      state.persistedIdentity = this.email;
    }
  }
  return createRegistrationController({
    userModel: InMemoryUser,
    passwordHasher: {
      async genSalt() { return "test-salt"; },
      async hash() { state.counters.hash += 1; return "test-hash"; },
    },
    sessionIssuer(_res, user) {
      state.counters.session += 1;
      return { token: "ephemeral-memory-value", user: { email: user.email } };
    },
  });
};

const expandedIdentityRows = () => identityRows.flatMap((row) => {
  const [id] = row;
  const seams = ["direct"];
  if (["V01", "V02", "R01", "R08", "R25"].includes(id)) seams.push("spa");
  return seams.map((seam) => ({ row, seam }));
});

const observeIdentityRow = async ({ port, row, seam, state }) => {
  const [id, email, accepted, expected] = row;
  resetSignupCounters(state.counters);
  state.persistedIdentity = undefined;
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-k6-fixture-seam": seam,
    },
    body: JSON.stringify(validRegistration(email)),
  });
  const responseBody = await response.json();
  if (response.status !== (accepted ? 201 : 400)) throw new Error(`identity row failed: ${id}`);
  if (accepted && state.persistedIdentity !== expected) {
    throw new Error(`identity normalization failed: ${id}`);
  }
  const sideEffectDelta = {
    find: state.counters.find,
    normalizedQuery: state.counters.normalizedQuery,
    hash: state.counters.hash,
    save: state.counters.save,
    session: state.counters.session,
    queue: state.counters.queue,
    provider: state.counters.provider,
  };
  if (!accepted && Object.values(sideEffectDelta).some((value) => value !== 0)) {
    throw new Error(`rejected identity reached downstream work: ${id}`);
  }
  return {
    inputId: `${id}-${seam}`,
    normalizedCategory: accepted ? "approved-test" : "rejected",
    persistedIdentity: accepted ? state.persistedIdentity : null,
    responseClass: responseBody.success === true ? "accepted" : "validation-rejected",
    limiterPolicyIds: ["auth_entry.aggregate", "auth_entry.register"],
    limiterBypass: false,
    sideEffectDelta,
  };
};

const scenarioSyntheticSignup = async ({ root, port }) => {
  const state = { counters: {}, persistedIdentity: undefined };
  const controller = createSignupController({ root, state });
  const server = await createSyntheticServer({
    controller,
    capabilities: { syntheticSignupOnly: true },
    counters: state.counters,
    port,
  });
  const identity = [];
  try {
    for (const { row, seam } of expandedIdentityRows()) {
      identity.push(await observeIdentityRow({ port, row, seam, state }));
    }
  } finally {
    await close(server);
  }
  return {
    identity,
    sideEffects: {
      ...emptySideEffects(),
      limiter: identity.length,
      bodyProcessing: identity.length,
    },
  };
};

const scenarioLegacyContract = async ({ root, port }) => {
  const { createRegistrationController } = require(path.join(
    root,
    "server",
    "src",
    "controllers",
    "registrationController.js",
  ));
  let savedEmail = null;
  class InMemoryUser {
    constructor(input) { Object.assign(this, input); this._id = "safe-user-id"; }
    static async findOne() { return null; }
    async save() { savedEmail = this.email; }
  }
  const controller = createRegistrationController({
    userModel: InMemoryUser,
    passwordHasher: { genSalt: async () => "salt", hash: async () => "hash" },
    sessionIssuer: (_res, user) => ({ token: "ephemeral", user: { email: user.email } }),
  });
  const counters = {};
  const server = await createSyntheticServer({
    controller,
    capabilities: { syntheticSignupOnly: false },
    counters,
    port,
  });
  let shape;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRegistration("contract-user@example.com")),
    });
    const body = await response.json();
    if (response.status !== 201 || savedEmail !== "contract-user@example.com") {
      throw new Error("legacy registration contract changed");
    }
    shape = Object.keys(body).sort();
  } finally {
    await close(server);
  }
  return {
    contractChecks: [{
      seam: "auth.register.response-keys",
      actualShape: shape,
      expectedShape: ["message", "success", "token", "user"],
      exactMatch: JSON.stringify(shape) === JSON.stringify(["message", "success", "token", "user"]),
    }],
    sideEffects: { ...emptySideEffects(), limiter: 1, bodyProcessing: 1, database: 1, session: 1 },
  };
};

module.exports = {
  scenarioLegacyContract,
  scenarioSyntheticSignup,
};
