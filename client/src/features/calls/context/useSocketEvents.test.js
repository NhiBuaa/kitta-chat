import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useSocketEvents.js", import.meta.url), "utf8");

test("useSocketEvents reads call user identity from AuthProvider context", () => {
    assert.match(source, /import \{ useAuth \} from ['"]@\/services\/auth\/AuthProvider\.jsx['"]/);
    assert.match(source, /const \{ user: authUser \} = useAuth\(\)/);
    assert.doesNotMatch(source, /getStoredUser/);
});

test("useSocketEvents uses auth user for diagnostics and skips glare offer when auth user is unavailable", () => {
    assert.match(source, /const loggedInUserId = authUser\?\._id \|\| authUser\?\.id \|\| null/);
    assert.match(source, /if \(!authUser\) return/);
    assert.match(source, /callerDbId: authUser\?\._id \|\| null/);
});
