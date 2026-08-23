import { useState } from "react";

import { RuntimeCapabilityUnavailable } from "./RuntimeCapabilityGate.js";
import { useRuntimeConfig } from "./RuntimeConfigProvider.js";
import { isLoopbackFixtureHost } from "./loopbackFixture.js";
import ChatInput from "@/features/chat/components/ChatInput.jsx";

const LoopbackAuthenticatedChatFixture = () => {
  const { capabilities } = useRuntimeConfig();
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);

  if (!isLoopbackFixtureHost(window.location.hostname)) {
    return <RuntimeCapabilityUnavailable capability="loopback-fixture" />;
  }

  return (
    <main
      className="min-h-screen bg-gray-100 p-8"
      data-k6-test-harness="authenticated-chat"
    >
      <section className="mx-auto max-w-3xl overflow-hidden rounded-xl bg-white shadow">
        <header className="border-b border-gray-200 p-4">
          <h1 className="font-semibold text-gray-800">K6 authenticated chat fixture</h1>
          <p className="text-sm text-gray-500">
            Loopback-only capability rendering harness.
          </p>
        </header>
        <div className="h-48 bg-gray-50" />
        <ChatInput
          showEmoji={showEmoji}
          setShowEmoji={setShowEmoji}
          onEmojiClick={(event) => setMessage((current) => current + event.emoji)}
          handleSendMessage={() => {}}
          newMessage={message}
          handleInputChange={(event) => setMessage(event.target.value)}
          uploadQueue={[]}
          addFiles={() => {}}
          removeUploadItem={() => {}}
          uploadEnabled={capabilities.upload}
        />
      </section>
    </main>
  );
};

export default LoopbackAuthenticatedChatFixture;
