const DEMO_NAMESPACE = "kittachat-demo";
const DEMO_BASE_TIME = Date.parse("2026-07-01T12:00:00.000Z");

const buildId = (family, index) =>
  `${family}${index.toString(16).padStart(21, "0")}`;

const userSpecs = [
  ["alice", "alice@kittachat.test", "Alice", "Building reliable realtime experiences."],
  ["bob", "bob@kittachat.test", "Bob", "Shipping the next KittaChat release."],
  ["chloe", "chloe@kittachat.test", "Chloe", "Product discovery and customer feedback."],
  ["daniel", "daniel@kittachat.test", "Daniel", "Design systems and interaction polish."],
  ["emma", "emma@kittachat.test", "Emma", "Keeping projects organized and moving."],
  ["felix", "felix@kittachat.test", "Felix", "API contracts and developer experience."],
  ["grace", "grace@kittachat.test", "Grace", "Testing edge cases before they reach users."],
  ["henry", "henry@kittachat.test", "Henry", "Infrastructure and local reproducibility."],
  ["iris", "iris@kittachat.test", "Iris", "Research, notes, and shared references."],
  ["jack", "jack@kittachat.test", "Jack", "Frontend performance and accessibility."],
  ["kara", "kara@kittachat.test", "Kara", "Visual communication and product storytelling."],
  ["liam", "liam@kittachat.test", "Liam", "Data modeling and query design."],
  ["maya", "maya@kittachat.test", "Maya", "Release planning and quality gates."],
  ["noah", "noah@kittachat.test", "Noah", "Observability and operational readiness."],
  ["olivia", "olivia@kittachat.test", "Olivia", "Documentation and onboarding."],
  ["paul", "paul@kittachat.test", "Paul", "Learning distributed systems together."],
  ["quinn", "quinn@kittachat.test", "Quinn", "Exploring WebRTC and media UX."],
  ["ruby", "ruby@kittachat.test", "Ruby", "Planning the next team meetup."],
  ["sam", "sam@kittachat.test", "Sam", "Helping teams communicate clearly."],
];

const DEMO_USER_EMAILS = userSpecs.map(([, email]) => email);

const directDefinitions = [
  ["aliceBob", "bob", "rich", 4, true],
  ["empty", "chloe", "empty", 0, true],
  ["mediaOnly", "daniel", "media", 2, false],
  ["filesOnly", "emma", "files", 0, false],
  ["linksOnly", "felix", "links", 1, false],
  ["longHistory", "grace", "history", 5, false],
  ["henry", "henry", "standard", 0, false],
  ["iris", "iris", "standard", 3, false],
  ["jack", "jack", "standard", 0, false],
  ["kara", "kara", "standard", 1, false],
  ["liam", "liam", "standard", 0, false],
  ["maya", "maya", "standard", 2, false],
  ["noah", "noah", "standard", 0, false],
  ["olivia", "olivia", "standard", 1, false],
  ["paul", "paul", "standard", 0, false],
  ["quinn", "quinn", "standard", 4, false],
  ["ruby", "ruby", "standard", 0, false],
  ["sam", "sam", "standard", 2, false],
];

const groupDefinitions = [
  ["backendTeam", "Backend Team", ["alice", "bob", "chloe", "felix", "henry"], 3],
  ["productGuild", "Product Guild", ["alice", "grace", "iris", "olivia"], 0],
  ["designReview", "Design Review", ["alice", "daniel", "jack", "kara"], 1],
  ["releaseCrew", "Release Crew", ["alice", "maya", "noah", "olivia"], 2],
  ["studyRoom", "Study Room", ["alice", "paul", "quinn"], 0],
  ["weekendPlans", "Weekend Plans", ["alice", "ruby", "sam", "bob"], 1],
];

function directConversationId(leftId, rightId) {
  return [leftId, rightId].sort().join("_");
}

function buildDemoDataset({ passwordHash, userIdsByEmail = {} }) {
  if (!passwordHash) {
    throw new Error("Demo dataset requires a password hash.");
  }

  const userByKey = new Map();
  userSpecs.forEach(([key, email, displayName, status], index) => {
    userByKey.set(key, {
      _id: userIdsByEmail[email] || buildId("64a", index + 1),
      email,
      displayName,
      status,
      avatar: `/demo-assets/avatars/${["alice", "bob", "green", "blue"][index % 4]}.svg`,
    });
  });

  const aliceId = userByKey.get("alice")._id;
  const directPeerIds = directDefinitions.map(([, peerKey]) => userByKey.get(peerKey)._id);
  const users = userSpecs.map(([key], index) => {
    const source = userByKey.get(key);
    const friends = key === "alice" ? directPeerIds : [aliceId];
    return {
      _id: source._id,
      email: source.email,
      password: passwordHash,
      displayName: source.displayName,
      avatar: source.avatar,
      provider: "local",
      status: source.status,
      isOnline: false,
      activityStatus: {
        state: "offline",
        lastSeen: new Date(DEMO_BASE_TIME - (index + 1) * 60 * 60 * 1000),
      },
      friends,
      friendRequests: [],
      createdAt: new Date(DEMO_BASE_TIME - 90 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(DEMO_BASE_TIME),
    };
  });

  const groups = groupDefinitions.map(([key, name, memberKeys], index) => ({
    _id: buildId("64b", index + 1),
    demoKey: key,
    name,
    admin: aliceId,
    members: memberKeys.map((memberKey) => userByKey.get(memberKey)._id),
    avatar: `/demo-assets/avatars/${["green", "blue", "alice", "bob"][index % 4]}.svg`,
    createdAt: new Date(DEMO_BASE_TIME - (30 - index) * 24 * 60 * 60 * 1000),
    updatedAt: new Date(DEMO_BASE_TIME),
  }));
  const groupByKey = new Map(groups.map((group) => [group.demoKey, group]));

  const files = [];
  const messages = [];
  const conversations = [];
  const participants = [];
  const catalog = { conversations: {} };
  let fileIndex = 0;
  let messageIndex = 0;
  let conversationIndex = 0;
  let participantIndex = 0;

  const nextTimestamp = () =>
    new Date(DEMO_BASE_TIME + messageIndex * 60 * 1000);

  const createFile = ({ ownerId, kind, sequence }) => {
    fileIndex += 1;
    const mediaNames = [
      "realtime-sidebar.svg",
      "conversation-panel.svg",
      "group-collaboration.svg",
      "webrtc-call.svg",
      "message-delivery.svg",
      "architecture-preview.svg",
    ];
    const documentNames = [
      "architecture-notes.txt",
      "api-contract.md",
      "release-checklist.txt",
      "incident-review.txt",
    ];
    const isMedia = kind === "media";
    const assetName = isMedia
      ? mediaNames[(sequence - 1) % mediaNames.length]
      : documentNames[(sequence - 1) % documentNames.length];
    const file = {
      _id: buildId("64c", fileIndex),
      ownerId,
      originalName: isMedia
        ? `kittachat-demo-${String(sequence).padStart(2, "0")}.svg`
        : assetName,
      mimeType: isMedia
        ? "image/svg+xml"
        : assetName.endsWith(".md")
          ? "text/markdown"
          : "text/plain",
      size: isMedia ? 4096 + sequence * 37 : 1024 + sequence * 29,
      s3Key: `demo-local/${assetName}`,
      url: `/demo-assets/${isMedia ? "media" : "files"}/${assetName}`,
      fileHash: `${DEMO_NAMESPACE}-${kind}-${String(sequence).padStart(3, "0")}`,
      requestId: `${DEMO_NAMESPACE}:file:${String(fileIndex).padStart(3, "0")}`,
      createdAt: nextTimestamp(),
      updatedAt: nextTimestamp(),
    };
    files.push(file);
    return file;
  };

  const createMessage = ({
    conversationKey,
    conversationId,
    senderId,
    receiverId,
    text = "",
    type = "text",
    attachments = [],
    links = [],
  }) => {
    messageIndex += 1;
    const createdAt = nextTimestamp();
    const message = {
      _id: buildId("64d", messageIndex),
      conversationId,
      type,
      sender: senderId,
      receiver: receiverId,
      text,
      attachments: attachments.map((file) => file._id),
      isRead: false,
      readBy: [senderId],
      idempotencyKey: `${DEMO_NAMESPACE}:${conversationKey}:${String(messageIndex).padStart(3, "0")}`,
      hasLink: links.length > 0,
      links,
      createdAt,
      updatedAt: createdAt,
    };
    messages.push(message);
    return message;
  };

  const addScenarioMessages = ({
    conversationKey,
    conversationId,
    scenario,
    senderIds,
    receiverIdFor,
  }) => {
    const addAttachmentMessages = (kind, count) => {
      for (let index = 1; index <= count; index += 1) {
        const senderId = senderIds[index % senderIds.length];
        const file = createFile({ ownerId: senderId, kind, sequence: index });
        createMessage({
          conversationKey,
          conversationId,
          senderId,
          receiverId: receiverIdFor(senderId),
          type: "file",
          attachments: [file],
        });
      }
    };

    const addLinkMessages = (count) => {
      const hosts = ["socket.io", "mongodb.com", "redis.io", "rabbitmq.com"];
      for (let index = 1; index <= count; index += 1) {
        const senderId = senderIds[index % senderIds.length];
        const hostname = hosts[(index - 1) % hosts.length];
        const url = `https://${hostname}/docs/kittachat-demo-${index}`;
        createMessage({
          conversationKey,
          conversationId,
          senderId,
          receiverId: receiverIdFor(senderId),
          text: `Shared reference ${index}: ${url}`,
          links: [{ url, hostname }],
        });
      }
    };

    if (scenario === "empty") return;
    if (scenario === "rich") {
      addAttachmentMessages("media", 22);
      addAttachmentMessages("file", 22);
      addLinkMessages(22);
      return;
    }
    if (scenario === "media") {
      addAttachmentMessages("media", 8);
      return;
    }
    if (scenario === "files") {
      addAttachmentMessages("file", 8);
      return;
    }
    if (scenario === "links") {
      addLinkMessages(8);
      return;
    }
    if (scenario === "history") {
      for (let index = 1; index <= 60; index += 1) {
        const senderId = senderIds[index % senderIds.length];
        createMessage({
          conversationKey,
          conversationId,
          senderId,
          receiverId: receiverIdFor(senderId),
          text: `Long-history demo message ${String(index).padStart(2, "0")}`,
        });
      }
      return;
    }

    for (let index = 1; index <= 2; index += 1) {
      const senderId = senderIds[index % senderIds.length];
      createMessage({
        conversationKey,
        conversationId,
        senderId,
        receiverId: receiverIdFor(senderId),
        text: index === 1 ? "Ready for the next review?" : "Yes, the demo workspace is prepared.",
      });
    }
  };

  const addConversation = ({
    key,
    kind,
    participantUserIds,
    legacyConversationId,
    groupId,
    scenario,
    unreadCount,
    pinned,
  }) => {
    const beforeMessageCount = messages.length;
    const senderIds = participantUserIds;
    addScenarioMessages({
      conversationKey: key,
      conversationId: legacyConversationId,
      scenario,
      senderIds,
      receiverIdFor: (senderId) => {
        if (kind === "group") return groupId;
        return participantUserIds.find((id) => id !== senderId);
      },
    });

    const conversationMessages = messages.slice(beforeMessageCount);
    const lastMessage = conversationMessages.at(-1) || null;
    conversationIndex += 1;
    const conversation = {
      _id: buildId("64e", conversationIndex),
      kind,
      legacyConversationId,
      participantUserIds,
      lastMessageId: lastMessage?._id,
      lastMessageAt: lastMessage?.createdAt || null,
      createdAt: new Date(DEMO_BASE_TIME - 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(DEMO_BASE_TIME),
      ...(kind === "direct"
        ? { directKey: legacyConversationId }
        : { groupId }),
    };
    conversations.push(conversation);
    catalog.conversations[key] = legacyConversationId;

    participantUserIds.forEach((userId) => {
      participantIndex += 1;
      const isAlice = userId === aliceId;
      const isGroupAdmin = kind === "group" && userId === aliceId;
      participants.push({
        _id: buildId("64f", participantIndex),
        conversationId: conversation._id,
        legacyConversationId,
        userId,
        role: kind === "direct" ? null : isGroupAdmin ? "admin" : "member",
        joinedAt: new Date(DEMO_BASE_TIME - 30 * 24 * 60 * 60 * 1000),
        leftAt: null,
        state: {
          pinnedAt: isAlice && pinned ? new Date(DEMO_BASE_TIME) : null,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          lastReadMessageId: isAlice && unreadCount > 0 ? null : lastMessage?._id || null,
          lastReadAt: isAlice && unreadCount > 0 ? null : lastMessage?.createdAt || null,
          unreadCount: isAlice ? unreadCount : 0,
          lastMessageId: lastMessage?._id || null,
          lastMessageAt: lastMessage?.createdAt || null,
        },
        settings: {
          notifications: "default",
          customTitle: null,
        },
        createdAt: new Date(DEMO_BASE_TIME - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(DEMO_BASE_TIME),
      });
    });
  };

  directDefinitions.forEach(([key, peerKey, scenario, unreadCount, pinned]) => {
    const peerId = userByKey.get(peerKey)._id;
    addConversation({
      key,
      kind: "direct",
      participantUserIds: [aliceId, peerId],
      legacyConversationId: directConversationId(aliceId, peerId),
      scenario,
      unreadCount,
      pinned,
    });
  });

  groupDefinitions.forEach(([key, , memberKeys, unreadCount], index) => {
    const group = groupByKey.get(key);
    addConversation({
      key,
      kind: "group",
      participantUserIds: memberKeys.map((memberKey) => userByKey.get(memberKey)._id),
      legacyConversationId: group._id,
      groupId: group._id,
      scenario: index === 0 ? "history" : "standard",
      unreadCount,
      pinned: false,
    });
  });

  return {
    namespace: DEMO_NAMESPACE,
    users,
    groups: groups.map(({ demoKey, ...group }) => group),
    files,
    messages,
    conversations,
    participants,
    catalog,
  };
}

module.exports = {
  DEMO_BASE_TIME,
  DEMO_NAMESPACE,
  DEMO_USER_EMAILS,
  buildDemoDataset,
  directConversationId,
};
