import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("outgoing media arms follow state before optimistic render and uses the central bottom scroll", () => {
    const source = readFileSync(new URL("./useChatMessages.js", import.meta.url), "utf8");
    const sendStart = source.indexOf("const handleSendMessage");
    const sendEnd = source.indexOf("const handleRetryMessage", sendStart);
    const sendSource = source.slice(sendStart, sendEnd);
    const armIndex = sendSource.indexOf("armAutoScrollLock();");
    const optimisticRenderIndex = sendSource.indexOf(
        "setMessages((prev) => [...prev, optimisticMessage]);"
    );
    const centralScrollIndex = sendSource.indexOf('scrollChatToBottom("smooth");');

    assert.ok(sendStart >= 0 && sendEnd > sendStart);
    assert.ok(armIndex >= 0 && armIndex < optimisticRenderIndex);
    assert.ok(centralScrollIndex > optimisticRenderIndex);
    assert.ok(!sendSource.includes("scrollRef.current?.scrollTo"));
});
