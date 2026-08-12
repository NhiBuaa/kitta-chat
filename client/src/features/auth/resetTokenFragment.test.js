import assert from "node:assert/strict";
import test from "node:test";

import { takeResetTokenFromFragment } from "./resetTokenFragment.js";

test("reset page takes the token from the fragment and immediately scrubs browser history", () => {
  const calls = [];
  const location = {
    hash: "#synthetic-reset-token",
    pathname: "/reset-password/user-1",
    search: "",
  };
  const history = {
    replaceState(...args) {
      calls.push(args);
    },
  };

  const token = takeResetTokenFromFragment({ location, history });

  assert.equal(token, "synthetic-reset-token");
  assert.deepEqual(calls, [[null, "", "/reset-password/user-1"]]);
});

test("reset page does not retain an empty fragment token", () => {
  const calls = [];
  const token = takeResetTokenFromFragment({
    location: { hash: "", pathname: "/reset-password/user-1", search: "" },
    history: { replaceState(...args) { calls.push(args); } },
  });

  assert.equal(token, null);
  assert.deepEqual(calls, []);
});
