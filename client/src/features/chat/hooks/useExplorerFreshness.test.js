import assert from "node:assert/strict";
import test from "node:test";
import {
  belongsToConversation,
  matchesMedia,
  matchesFile,
  matchesLink,
} from "./useExplorerFreshness.js";

// belongsToConversation tests
test("belongsToConversation matches group conversation by receiverId", () => {
  const message = {
    isGroup: true,
    receiverId: "group-123",
  };
  assert.equal(belongsToConversation(message, "group-123", "user-me"), true);
  assert.equal(belongsToConversation(message, "group-456", "user-me"), false);
});

test("belongsToConversation matches direct conversation by conversationId property", () => {
  const message = {
    conversationId: "user-1_user-2",
  };
  assert.equal(belongsToConversation(message, "user-1_user-2", "user-me"), true);
  assert.equal(belongsToConversation(message, "user-1_user-3", "user-me"), false);
});

test("belongsToConversation matches direct conversation by computed sorted pair", () => {
  const message1 = {
    isGroup: false,
    senderId: "user-1",
    receiverId: "user-2",
  };
  assert.equal(belongsToConversation(message1, "user-1_user-2", "user-me"), true);

  const message2 = {
    isGroup: false,
    senderId: "user-2",
    receiverId: "user-1",
  };
  // Sorting order of user-1 and user-2 is user-1_user-2
  assert.equal(belongsToConversation(message2, "user-1_user-2", "user-me"), true);
});

// matchesMedia tests
test("matchesMedia checks image property or mimeTypes", () => {
  assert.equal(matchesMedia({ image: "http://example.com/img.png" }), true);
  assert.equal(
    matchesMedia({
      attachments: [{ mimeType: "image/jpeg" }],
    }),
    true
  );
  assert.equal(
    matchesMedia({
      attachmentsData: [{ mimeType: "video/mp4" }],
    }),
    true
  );
  assert.equal(
    matchesMedia({
      attachments: [{ mimeType: "application/pdf" }],
    }),
    false
  );
  assert.equal(matchesMedia({ text: "Hello" }), false);
});

// matchesFile tests
test("matchesFile checks non-media attachments", () => {
  assert.equal(
    matchesFile({
      attachments: [{ mimeType: "application/pdf" }],
    }),
    true
  );
  assert.equal(
    matchesFile({
      attachmentsData: [{ mimeType: "image/png" }],
    }),
    false
  );
  assert.equal(matchesFile({ image: "some-image" }), false);
});

// matchesLink tests
test("matchesLink checks URL patterns in text", () => {
  assert.equal(matchesLink({ text: "Check this out https://google.com" }), true);
  assert.equal(matchesLink({ text: "Visit www.example.com for info" }), true);
  assert.equal(matchesLink({ text: "Just a regular text message" }), false);
  assert.equal(matchesLink({}), false);
});
