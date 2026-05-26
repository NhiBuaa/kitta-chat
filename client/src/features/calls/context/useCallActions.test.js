import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useCallActions.js", import.meta.url), "utf8");

test("useCallActions reads caller identity from AuthProvider context", () => {
    assert.match(source, /import \{ useAuth \} from ['"]@\/services\/auth\/AuthProvider\.jsx['"]/);
    assert.match(source, /const \{ user: authUser \} = useAuth\(\)/);
    assert.doesNotMatch(source, /getStoredUser/);
});

test("useCallActions blocks outbound call when auth user is unavailable", () => {
    assert.match(source, /if \(!authUser\) \{ toast\.error\(/);
    assert.match(source, /callerDbId: authUser\._id \|\| authUser\.id/);
});
