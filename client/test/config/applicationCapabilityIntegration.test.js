import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import React, { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let App;
let CallLogItem;
let ChatWindow;
let Login;
let LoopbackAuthenticatedChatFixture;
let RuntimeConfigContext;
let Sidebar;
let UserProfileModal;
let vite;

before(async () => {
  vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    ssr: { noExternal: ["styled-components"] },
  });

  ({ default: App } = await vite.ssrLoadModule("/src/app/router.jsx"));
  ({ default: CallLogItem } = await vite.ssrLoadModule(
    "/src/features/calls/components/CallLogItem.jsx",
  ));
  ({ default: ChatWindow } = await vite.ssrLoadModule(
    "/src/features/chat/components/ChatWindow.jsx",
  ));
  ({ default: Login } = await vite.ssrLoadModule(
    "/src/features/auth/pages/Login.jsx",
  ));
  ({ default: LoopbackAuthenticatedChatFixture } = await vite.ssrLoadModule(
    "/src/config/LoopbackAuthenticatedChatFixture.jsx",
  ));
  ({ RuntimeConfigContext } = await vite.ssrLoadModule(
    "/src/config/RuntimeConfigProvider.js",
  ));
  ({ default: Sidebar } = await vite.ssrLoadModule(
    "/src/components/layout/Sidebar.jsx",
  ));
  ({ default: UserProfileModal } = await vite.ssrLoadModule(
    "/src/features/profile/components/UserProfileModal.jsx",
  ));
});

after(async () => {
  await vite?.close();
});

test("the real application router is loadable through the client build seam", () => {
  assert.equal(typeof App, "function");
});

const disabledCapabilities = Object.freeze({
  calls: false,
  googleLogin: false,
  recovery: false,
  selfSignup: false,
  upload: false,
});

const renderWithRuntime = async (runtime, child) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(
      RuntimeConfigContext.Provider,
      { value: runtime },
      child,
    ));
  });
  return renderer;
};

test("the real login hides optional controls during loading and when disabled", async () => {
  for (const runtime of [
    { status: "loading", capabilities: { ...disabledCapabilities, googleLogin: true, recovery: true, selfSignup: true } },
    { status: "ready", capabilities: disabledCapabilities },
  ]) {
    const renderer = await renderWithRuntime(
      runtime,
      createElement(MemoryRouter, null, createElement(Login)),
    );

    assert.equal(renderer.root.findAllByProps({ href: "/forgot-password" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ href: "/register" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ alt: "Google" }).length, 0);
    await act(async () => renderer.unmount());
  }
});

test("the real router fails closed for disabled register, recovery, reset, and call routes", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    requests.push(args);
    throw new Error("disabled routes must not request a backend");
  };

  try {
    for (const [path, capability] of [
      ["/register", "selfSignup"],
      ["/forgot-password", "recovery"],
      ["/reset-password/demo-id", "recovery"],
      ["/call/bob.test", "calls"],
    ]) {
      const renderer = await renderWithRuntime(
        { status: "ready", capabilities: disabledCapabilities },
        createElement(App, {
          Notifications: () => null,
          Router: MemoryRouter,
          routerProps: { initialEntries: [path] },
        }),
      );

      assert.equal(
        renderer.root.findAllByProps({ "data-capability-unavailable": capability }).length,
        1,
        path,
      );
      await act(async () => renderer.unmount());
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, []);
});

test("the real authenticated-chat fixture omits upload controls when upload is disabled", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    addEventListener: () => {},
    location: { hostname: "127.0.0.1" },
    removeEventListener: () => {},
  };

  try {
    const renderer = await renderWithRuntime(
      { status: "ready", capabilities: disabledCapabilities },
      createElement(LoopbackAuthenticatedChatFixture),
    );

    assert.equal(renderer.root.findAllByProps({ title: "Gửi ảnh" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ title: "Gửi file" }).length, 0);
    await act(async () => renderer.unmount());
  } finally {
    globalThis.window = originalWindow;
  }
});

test("the real call-log item omits recall controls when calls are disabled", async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(CallLogItem, {
      callsEnabled: false,
      chatPartner: { _id: "bob.test", displayName: "Bob" },
      currentUser: { _id: "alice.test" },
      log: {
        callData: { status: "missed", type: "audio" },
        createdAt: "2026-08-22T00:00:00.000Z",
        receiver: "alice.test",
        sender: "bob.test",
      },
      onRecall: () => {
        throw new Error("disabled recall must not be callable");
      },
    }));
  });

  assert.equal(renderer.root.findAllByProps({ title: "Gọi lại" }).length, 0);
  await act(async () => renderer.unmount());
});

test("all real chat surfaces omit call controls when calls are disabled", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests = [];
  const failCall = () => {
    throw new Error("disabled call control must not be callable");
  };
  globalThis.fetch = async (...args) => {
    requests.push(args);
    throw new Error("disabled call surface must not request a backend");
  };
  globalThis.window = {
    addEventListener: () => {},
    location: { hostname: "127.0.0.1" },
    removeEventListener: () => {},
  };

  const user = {
    _id: "bob.test",
    activityStatus: { state: "offline" },
    avatar: "",
    displayName: "Bob",
    isFriend: true,
  };
  const currentUser = {
    _id: "alice.test",
    activityStatus: { state: "active" },
    avatar: "",
    displayName: "Alice",
  };
  const renderers = [];

  try {
    await act(async () => {
      renderers.push(TestRenderer.create(createElement(Sidebar, {
        activeFilter: "all",
        callsEnabled: false,
        checkIsOnline: () => false,
        conversations: [],
        currentUser,
        getAvatarUrl: () => "/demo-assets/avatar.svg",
        handleAddFriend: () => {},
        handleLogout: () => {},
        handleSelectUser: () => {},
        hasMore: false,
        isFetching: false,
        isSearching: true,
        onLoadMore: () => {},
        requestCount: 0,
        searchTerm: "",
        sentRequests: [],
        setActiveFilter: () => {},
        setSearchTerm: () => {},
        setShowCallHistoryModal: failCall,
        setShowCreateGroup: () => {},
        setShowProfile: () => {},
        setShowRequestModal: () => {},
      })));
    });

    await act(async () => {
      renderers.push(TestRenderer.create(createElement(ChatWindow, {
        activeChat: user,
        bottomRef: { current: null },
        callsEnabled: false,
        checkIsOnline: () => false,
        currentChatUser: user,
        currentUser,
        getAvatarUrl: () => "/demo-assets/avatar.svg",
        handleCall: failCall,
        handleRetryMessage: () => {},
        handleScrollToBottom: () => {},
        hasNewUnread: false,
        isChatBootstrapping: false,
        isLoadingMore: false,
        isPanelEnabled: false,
        isTyping: false,
        loadMoreMessages: () => {},
        messages: [],
        onMediaContentLoad: () => {},
        scrollRef: { current: null },
        setActiveChat: () => {},
        setHasNewUnread: () => {},
        setShowConversationPanel: () => {},
        showConversationPanel: false,
        typingUserAvatar: "",
        typingUserName: "",
        users: [],
      })));
    });

    await act(async () => {
      renderers.push(TestRenderer.create(createElement(UserProfileModal, {
        callsEnabled: false,
        checkIsOnline: () => false,
        getAvatarUrl: () => "/demo-assets/avatar.svg",
        isOpen: true,
        onCall: failCall,
        onClose: () => {},
        onUnfriend: () => {},
        user,
      })));
    });

    const [sidebar, chatWindow, profile] = renderers;
    assert.equal(sidebar.root.findAllByProps({ title: "Lịch sử cuộc gọi" }).length, 0);
    assert.equal(chatWindow.root.findAllByProps({ title: "Gọi Audio" }).length, 0);
    assert.equal(chatWindow.root.findAllByProps({ title: "Gọi Video" }).length, 0);
    const profileText = JSON.stringify(profile.toJSON());
    assert.equal(profileText.includes("Gọi thoại"), false);
    assert.equal(profileText.includes("Gọi video"), false);
    assert.deepEqual(requests, []);
  } finally {
    for (const renderer of renderers) {
      await act(async () => renderer.unmount());
    }
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
