import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SocketProvider.jsx", import.meta.url), "utf8");

test("SocketProvider wires socket auth from AuthProvider user without stored-user fallback", () => {
    assert.match(source, /const \{ token, user: authUser, isChecking, isAuthenticated \} = useAuth\(\)/);
    assert.doesNotMatch(source, /getStoredUser|setStoredUser/);
    assert.doesNotMatch(source, /fallbackUser/);
    assert.match(source, /user:\s*authUser/);
});
