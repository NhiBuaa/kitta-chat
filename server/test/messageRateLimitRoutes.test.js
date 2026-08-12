const assert = require("node:assert/strict");
const test = require("node:test");

const routerPath = require.resolve("../src/routes/messages");

test("message routes apply one authenticated-principal admission with their route-specific policy IDs", () => {
  delete require.cache[routerPath];
  const router = require(routerPath);
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, handlers: layer.route.stack.map((entry) => entry.handle) }));

  const write = routes.find((route) => route.path === "/");
  const history = routes.find((route) => route.path === "/:userId1/:userId2");
  const sync = routes.find((route) => route.path === "/sync");

  assert.equal(write.handlers.length, 3);
  assert.equal(history.handlers.length, 3);
  assert.equal(sync.handlers.length, 3);
  assert.notEqual(write.handlers[1], sync.handlers[1]);
  assert.notEqual(history.handlers[1], sync.handlers[1]);
});
