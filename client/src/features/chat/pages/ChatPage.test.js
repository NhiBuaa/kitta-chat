import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("conversation panel shrinks the chat column instead of overlaying it on narrow desktop viewports", () => {
  const chatPageSource = readFileSync(new URL("./ChatPage.jsx", import.meta.url), "utf8");
  const conversationPanelSource = readFileSync(
    new URL("../components/ConversationPanel.jsx", import.meta.url),
    "utf8",
  );

  const layoutContract = {
    chatAllowsShrink: chatPageSource.includes(
      "${activeChat ? \"flex\" : \"hidden sm:flex\"} flex-1 min-w-0 flex-col",
    ),
    panelParticipatesInRowAtSm: conversationPanelSource.includes(
      "fixed sm:relative inset-y-0 right-0 sm:inset-auto",
    ),
  };

  assert.deepEqual(layoutContract, {
    chatAllowsShrink: true,
    panelParticipatesInRowAtSm: true,
  });
});

test("opening the conversation panel keeps the sidebar available for switching conversations", () => {
  const chatPageSource = readFileSync(new URL("./ChatPage.jsx", import.meta.url), "utf8");

  assert.equal(
    chatPageSource.includes(
      '${activeChat ? "hidden sm:flex" : "flex"} w-full sm:w-auto h-full',
    ),
    true,
  );
});
