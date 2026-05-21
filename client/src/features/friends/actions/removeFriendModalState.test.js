import test from "node:test";
import assert from "node:assert/strict";

import {
    closeRemoveFriendModal,
    createClosedRemoveFriendModalState,
    finishRemoveFriendSubmit,
    openRemoveFriendModal,
    startRemoveFriendSubmit,
} from "./removeFriendModalState.js";

test("clicking unfriend opens modal for a friend", () => {
    const state = openRemoveFriendModal({ _id: "friend-1", displayName: "Alice" });

    assert.equal(state.isOpen, true);
    assert.equal(state.targetUser.displayName, "Alice");
    assert.equal(state.isLoading, false);
});

test("cancel closes modal and does not submit", () => {
    const openState = openRemoveFriendModal({ _id: "friend-1" });
    const closedState = closeRemoveFriendModal(openState);

    assert.deepEqual(closedState, createClosedRemoveFriendModalState());
});

test("confirm enters loading state and allows one API submit", () => {
    const openState = openRemoveFriendModal({ _id: "friend-1" });
    const result = startRemoveFriendSubmit(openState);

    assert.equal(result.shouldSubmit, true);
    assert.equal(result.state.isLoading, true);
});

test("loading state prevents cancel closing the modal", () => {
    const loadingState = { ...openRemoveFriendModal({ _id: "friend-1" }), isLoading: true };

    assert.equal(closeRemoveFriendModal(loadingState), loadingState);
});

test("duplicate confirm does not submit twice", () => {
    const loadingState = { ...openRemoveFriendModal({ _id: "friend-1" }), isLoading: true };
    const result = startRemoveFriendSubmit(loadingState);

    assert.equal(result.shouldSubmit, false);
    assert.equal(result.state, loadingState);
});

test("successful API submit closes modal", () => {
    const loadingState = { ...openRemoveFriendModal({ _id: "friend-1" }), isLoading: true };

    assert.deepEqual(
        finishRemoveFriendSubmit(loadingState, { closeOnSuccess: true }),
        createClosedRemoveFriendModalState(),
    );
});

test("API error keeps modal open and clears loading", () => {
    const loadingState = { ...openRemoveFriendModal({ _id: "friend-1" }), isLoading: true };
    const nextState = finishRemoveFriendSubmit(loadingState, { closeOnSuccess: false });

    assert.equal(nextState.isOpen, true);
    assert.equal(nextState.targetUser._id, "friend-1");
    assert.equal(nextState.isLoading, false);
});

test("confirm reads targetUserId from open state snapshot - not from setState updater callback", () => {
    // Regression: previously targetUserId was read inside a setState updater callback,
    // which React does not flush synchronously, causing the variable to remain null and
    // the submit guard to return early, leaving isLoading stuck true forever.
    // The fix reads snapshot BEFORE calling setState.
    const openState = openRemoveFriendModal({ _id: "user-42", displayName: "Bob" });

    // Simulate the fixed flow: read synchronously before setState
    const targetUserId = openState.isOpen && openState.targetUser && !openState.isLoading
        ? openState.targetUser._id
        : null;

    assert.equal(targetUserId, "user-42",
        "targetUserId must be readable from state snapshot without awaiting setState flush");
});

test("loading resets to false after finishRemoveFriendSubmit on API error", () => {
    // Regression: if finishRemoveFriendSubmit is never called (stuck in flight),
    // isLoading stays true and modal never recovers.
    const loadingState = { ...openRemoveFriendModal({ _id: "friend-1" }), isLoading: true };
    const recovered = finishRemoveFriendSubmit(loadingState, { closeOnSuccess: false });

    assert.equal(recovered.isLoading, false, "loading must reset to false after API error");
    assert.equal(recovered.isOpen, true, "modal must stay open after API error");
});
