import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./CallHistoryProvider.jsx", import.meta.url), "utf8");

test("CallHistoryProvider uses SocketProvider currentUser for callLogMessage fallback", () => {
    assert.match(source, /const \{ socket, currentUser \} = useSocket\(\)/);
    assert.match(source, /const currentUserId = getCurrentUserId\(currentUser\)/);
    assert.doesNotMatch(source, /getStoredUser/);
});

test("CallHistoryProvider skips callLogMessage badge fallback when current user is unavailable", () => {
    assert.match(source, /if \(!currentUserId\) return/);
    assert.match(source, /currentUserId,/);
    assert.match(source, /\}, \[socket, currentUserId\]\)/);
});
