import test from "node:test";
import assert from "node:assert/strict";

import {
    CALL_HISTORY_REFRESH_EVENT,
    applyCallHistorySyncToMissedCount,
    applyCallLogMessageToMissedCount,
    clearMissedCallCount,
    dispatchCallHistoryRefresh,
    getCurrentUserId,
    hydrateMissedCountForCurrentUser,
    hydrateMissedCount,
    readMissedCountFromResponse,
    shouldHydrateMissedCount,
    subscribeCallHistoryAuthRefresh,
    subscribeCallHistoryRefresh,
} from "./callHistoryBadgeState.js";

test("refresh event hydrates missed call count through the subscribed fetcher", () => {
    const target = new EventTarget();
    let fetchCount = 0;
    const unsubscribe = subscribeCallHistoryRefresh({
        target,
        fetchMissedCount: () => {
            fetchCount += 1;
        },
    });

    dispatchCallHistoryRefresh(target);
    unsubscribe();
    dispatchCallHistoryRefresh(target);

    assert.equal(fetchCount, 1);
});

test("initial mount without token skips hydration until token/login is available", () => {
    assert.equal(shouldHydrateMissedCount({ token: null }), false);
    assert.equal(shouldHydrateMissedCount({ token: "" }), false);
    assert.equal(shouldHydrateMissedCount({ token: "jwt-token" }), true);
});

test("missed count hydration skips fetch when token is unavailable", async () => {
    let fetchCount = 0;
    let missedCount = null;

    await hydrateMissedCount({
        getToken: () => null,
        getMissedCalls: async () => {
            fetchCount += 1;
            return { data: { success: true, data: { count: 3 } } };
        },
        setMissedCount: (nextCount) => {
            missedCount = nextCount;
        },
        isFetchingRef: { current: false },
    });

    assert.equal(fetchCount, 0);
    assert.equal(missedCount, null);
});

test("current user id resolves from _id or id and skips missing users", () => {
    assert.equal(getCurrentUserId(null), null);
    assert.equal(getCurrentUserId({}), null);
    assert.equal(getCurrentUserId({ _id: "user-a" }), "user-a");
    assert.equal(getCurrentUserId({ id: "user-b" }), "user-b");
});

test("current user hydration does not fetch when currentUserId is null", async () => {
    let fetchCount = 0;

    await hydrateMissedCountForCurrentUser({
        currentUserId: null,
        hydrate: async () => {
            fetchCount += 1;
        },
    });

    assert.equal(fetchCount, 0);
});

test("current user hydration fetches when currentUserId becomes available", async () => {
    let fetchCount = 0;

    await hydrateMissedCountForCurrentUser({
        currentUserId: "receiver-user",
        hydrate: async () => {
            fetchCount += 1;
        },
    });

    assert.equal(fetchCount, 1);
});

test("mount no token then login currentUser available hydrates count from REST", async () => {
    let token = null;
    let missedCount = 0;
    const isFetchingRef = { current: false };
    const hydrate = () => hydrateMissedCount({
        getToken: () => token,
        getMissedCalls: async () => ({ data: { success: true, data: { count: 1 } } }),
        setMissedCount: (nextCount) => {
            missedCount = nextCount;
        },
        isFetchingRef,
    });

    await hydrate();
    token = "jwt-token";
    await hydrateMissedCountForCurrentUser({
        currentUserId: "receiver-user",
        hydrate,
    });

    assert.equal(missedCount, 1);
});

test("in-flight guard prevents duplicate concurrent missed count fetches", async () => {
    let fetchCount = 0;

    await hydrateMissedCount({
        getToken: () => "jwt-token",
        getMissedCalls: async () => {
            fetchCount += 1;
            return { data: { success: true, data: { count: 3 } } };
        },
        setMissedCount: () => {},
        isFetchingRef: { current: true },
    });

    assert.equal(fetchCount, 0);
});

test("missed count hydration updates count when token is available", async () => {
    let missedCount = 0;

    await hydrateMissedCount({
        getToken: () => "jwt-token",
        getMissedCalls: async () => ({ data: { success: true, data: { count: 3 } } }),
        setMissedCount: (nextCount) => {
            missedCount = nextCount;
        },
        isFetchingRef: { current: false },
    });

    assert.equal(missedCount, 3);
});

test("auth-changed event hydrates missed count after SPA login token becomes available", () => {
    const target = new EventTarget();
    let fetchCount = 0;
    const unsubscribe = subscribeCallHistoryAuthRefresh({
        target,
        fetchMissedCount: () => {
            fetchCount += 1;
        },
    });

    target.dispatchEvent(new Event("auth-changed"));
    unsubscribe();
    target.dispatchEvent(new Event("auth-changed"));

    assert.equal(fetchCount, 1);
});

test("storage event hydrates missed count after cross-tab token availability", () => {
    const target = new EventTarget();
    let fetchCount = 0;
    const unsubscribe = subscribeCallHistoryAuthRefresh({
        target,
        fetchMissedCount: () => {
            fetchCount += 1;
        },
    });

    target.dispatchEvent(new Event("storage"));
    unsubscribe();
    target.dispatchEvent(new Event("storage"));

    assert.equal(fetchCount, 1);
});

test("missed count is read safely from REST response count or preview calls", () => {
    assert.equal(readMissedCountFromResponse({ count: 2, missedCalls: [{}, {}, {}] }), 2);
    assert.equal(readMissedCountFromResponse({ calls: [{}, {}] }), 2);
    assert.equal(readMissedCountFromResponse({ missedCalls: [{}] }), 1);
    assert.equal(readMissedCountFromResponse(null), 0);
});

test("realtime callHistorySync increments only unread incoming final calls once", () => {
    const processedCallIds = new Set();
    const first = applyCallHistorySyncToMissedCount({
        previousCount: 0,
        data: {
            callId: "call-1",
            direction: "incoming",
            status: "missed",
            isReadByCurrentUser: false,
        },
        processedCallIds,
    });
    const duplicate = applyCallHistorySyncToMissedCount({
        previousCount: first,
        data: {
            callId: "call-1",
            direction: "incoming",
            status: "missed",
            isReadByCurrentUser: false,
        },
        processedCallIds,
    });
    const outgoing = applyCallHistorySyncToMissedCount({
        previousCount: duplicate,
        data: {
            callId: "call-2",
            direction: "outgoing",
            status: "missed",
            isReadByCurrentUser: false,
        },
        processedCallIds,
    });

    assert.equal(first, 1);
    assert.equal(duplicate, 1);
    assert.equal(outgoing, 1);
});

test("realtime callLogMessage fallback increments only unseen incoming final calls", () => {
    const processedCallIds = new Set(["synced-call"]);
    const fromSync = applyCallLogMessageToMissedCount({
        previousCount: 0,
        data: {
            type: "call_log",
            senderId: "caller",
            callData: { callHistoryId: "synced-call", status: "missed" },
        },
        currentUserId: "receiver",
        processedCallIds,
    });
    const unseen = applyCallLogMessageToMissedCount({
        previousCount: fromSync,
        data: {
            type: "call_log",
            senderId: "caller",
            callData: { callHistoryId: "new-call", status: "missed" },
        },
        currentUserId: "receiver",
        processedCallIds,
    });

    assert.equal(fromSync, 0);
    assert.equal(unseen, 1);
});

test("opening call history clears missed count", () => {
    assert.equal(clearMissedCallCount(4), 0);
});

test("refresh event name is stable for SocketProvider bridge", () => {
    assert.equal(CALL_HISTORY_REFRESH_EVENT, "call-history-refresh-needed");
});
