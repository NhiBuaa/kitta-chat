import assert from "node:assert/strict";
import test from "node:test";

import { createScrollFollowState } from "./scrollFollowState.js";

test("conversation keeps following the latest message after delayed media changes layout", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.markAtBottom();

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), true);
});

test("conversation stops following media after the user moves away from the bottom", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.updateFromDistance(151);

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), false);
});

test("conversation resumes following media when the user returns to the bottom", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.updateFromDistance(151);
    scrollFollowState.updateFromDistance(150);

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), true);
});

test("programmatic scroll to bottom restores following after reading older messages", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.updateFromDistance(500);
    scrollFollowState.markAtBottom();

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), true);
});

test("multiple media layout changes keep following while the conversation remains anchored", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.markAtBottom();

    assert.deepEqual(
        [
            scrollFollowState.shouldFollowMediaLoad(),
            scrollFollowState.shouldFollowMediaLoad(),
            scrollFollowState.shouldFollowMediaLoad(),
        ],
        [true, true, true]
    );
});

test("invalid scroll distance does not enable forced media following", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.updateFromDistance(undefined);

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), false);
});

test("programmatic scroll events do not cancel following while outgoing media changes layout", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.markAtBottom();
    scrollFollowState.updateFromDistance(519, { allowMovingAway: false });

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), true);
});

test("explicit user scroll intent can move the conversation away from the bottom", () => {
    const scrollFollowState = createScrollFollowState();

    scrollFollowState.markAtBottom();
    scrollFollowState.updateFromDistance(519, { allowMovingAway: true });

    assert.equal(scrollFollowState.shouldFollowMediaLoad(), false);
});

test("outgoing message remains bottom anchored through multiple media layout changes", () => {
    const scrollFollowState = createScrollFollowState();
    let distanceToBottom = 0;

    scrollFollowState.markAtBottom();

    for (const mediaHeight of [220, 300, 400]) {
        distanceToBottom += mediaHeight;
        scrollFollowState.updateFromDistance(distanceToBottom, {
            allowMovingAway: false,
        });

        if (scrollFollowState.shouldFollowMediaLoad()) {
            distanceToBottom = 0;
            scrollFollowState.updateFromDistance(distanceToBottom, {
                allowMovingAway: false,
            });
        }
    }

    assert.equal(distanceToBottom, 0);
    assert.equal(scrollFollowState.shouldFollowMediaLoad(), true);
});
