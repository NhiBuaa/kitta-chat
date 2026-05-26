const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

const firebaseAdminPath = require.resolve("../src/config/firebaseAdmin");

test("firebaseAdmin config can be imported without firebase-service.json", () => {
  const originalLoad = Module._load;
  delete require.cache[firebaseAdminPath];

  Module._load = function load(request, parent, isMain) {
    if (request === "./firebase-service.json" && parent?.filename === firebaseAdminPath) {
      const error = new Error("Cannot find module './firebase-service.json'");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const firebaseAdmin = require(firebaseAdminPath);

    assert.equal(typeof firebaseAdmin.auth, "function");
    assert.throws(() => firebaseAdmin.auth(), /Firebase Admin credentials are not configured/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[firebaseAdminPath];
  }
});
