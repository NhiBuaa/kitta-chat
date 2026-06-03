import test from "node:test";
import assert from "node:assert/strict";

import {
  closeUserProfileModal,
  getUserProfileActions,
  openUserProfileModal,
} from "./userProfileModalState.js";

test("openUserProfileModal opens only when user has an id", () => {
  const user = { _id: "friend-1", displayName: "Alice" };

  assert.deepEqual(openUserProfileModal(user), {
    isOpen: true,
    user,
  });

  assert.deepEqual(openUserProfileModal({ displayName: "No id" }), {
    isOpen: false,
    user: null,
  });
  assert.deepEqual(openUserProfileModal(null), {
    isOpen: false,
    user: null,
  });
});

test("closeUserProfileModal closes the modal", () => {
  const openState = openUserProfileModal({ _id: "friend-1" });

  assert.deepEqual(closeUserProfileModal(openState), {
    isOpen: false,
    user: null,
  });
});

test("direct friend profile actions include audio, video, and unfriend", () => {
  const actions = getUserProfileActions({
    user: { _id: "friend-1", isFriend: true },
    isGroupChat: false,
  });

  assert.deepEqual(actions.map((action) => action.id), ["audio", "video", "unfriend"]);
});

test("direct non-friend profile actions exclude unfriend", () => {
  const actions = getUserProfileActions({
    user: { _id: "user-1", isFriend: false },
    isGroupChat: false,
  });

  assert.deepEqual(actions.map((action) => action.id), ["audio", "video"]);
});

test("group chats do not expose direct-user profile actions", () => {
  const actions = getUserProfileActions({
    user: { _id: "group-1", isFriend: true },
    isGroupChat: true,
  });

  assert.deepEqual(actions, []);
});
