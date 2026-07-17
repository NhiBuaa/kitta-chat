const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const resourceServicePath = require.resolve("../src/services/resourceService");
const messagePath = require.resolve("../src/models/Message");
const filePath = require.resolve("../src/models/File");
const participantPath = require.resolve("../src/models/ConversationParticipant");
const visibilityHelpersPath = require.resolve("../src/services/conversationVisibilityHelpers");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

let mockMessages = [];
let mockFiles = [];
let mockParticipants = [];
let lastFindQuery = null;

const MessageMock = {
  find(query) {
    lastFindQuery = query;
    // Lọc theo query cơ bản
    let result = [...mockMessages];
    if (query.conversationId) {
      result = result.filter(m => m.conversationId === query.conversationId);
    }
    if (query.hasLink !== undefined) {
      result = result.filter(m => m.hasLink === query.hasLink);
    }
    if (query._id && query._id.$lt) {
      const ltId = query._id.$lt.toString();
      result = result.filter(m => m._id.toString() < ltId);
    }
    if (query.createdAt && query.createdAt.$gt) {
      result = result.filter(m => m.createdAt > query.createdAt.$gt);
    }
    if (query.createdAt && query.createdAt.$lte) {
      result = result.filter(m => m.createdAt <= query.createdAt.$lte);
    }

    // Giả lập chain
    return {
      sort(sortDoc) {
        // Sắp xếp theo _id desc
        result.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
        return {
          limit(lim) {
            result = result.slice(0, lim);
            return {
              select(fields) {
                return {
                  lean: async () => result
                };
              }
            };
          }
        };
      }
    };
  }
};

const FileMock = {
  find(query) {
    let result = [...mockFiles];
    if (query._id && query._id.$in) {
      const ids = query._id.$in.map(id => id.toString());
      result = result.filter(f => ids.includes(f._id.toString()));
    }
    if (query.mimeType && query.mimeType.$regex) {
      const regex = query.mimeType.$regex;
      result = result.filter(f => regex.test(f.mimeType));
    }
    return {
      lean: async () => result
    };
  }
};

const ParticipantMock = {
  findOne: async (query) => {
    return mockParticipants.find(p => 
      p.legacyConversationId === query.legacyConversationId &&
      p.userId.toString() === query.userId.toString()
    ) || null;
  }
};

const visibilityHelpersMock = {
  buildMessageVisibilityFilter: (participant) => {
    const createdAt = {};
    if (participant && participant.state && participant.state.deletedAt) {
      createdAt.$gt = participant.state.deletedAt;
    }
    if (participant && participant.leftAt) {
      createdAt.$lte = participant.leftAt;
    }
    return Object.keys(createdAt).length > 0 ? { createdAt } : {};
  }
};

// Clear cache
delete require.cache[resourceServicePath];
delete require.cache[messagePath];
delete require.cache[filePath];
delete require.cache[participantPath];
delete require.cache[visibilityHelpersPath];

mockModule(messagePath, MessageMock);
mockModule(filePath, FileMock);
mockModule(participantPath, ParticipantMock);
mockModule(visibilityHelpersPath, visibilityHelpersMock);

// Import service
const resourceService = require("../src/services/resourceService");

test("loadMedia - trả về danh sách ảnh/video trống khi không có tin nhắn", async () => {
  mockMessages = [];
  mockFiles = [];
  mockParticipants = [];

  const res = await resourceService.loadMedia("conv-123", 6);
  assert.deepEqual(res.items, []);
  assert.equal(res.hasMore, false);
  assert.equal(res.nextCursor, null);
});

test("loadMedia - tải đúng tối đa limit ảnh/video và trả về hasMore/nextCursor chính xác", async () => {
  const conversationId = "conv-123";
  
  // Tạo msgIds và fileIds với ID tăng dần cố định để sort desc đúng thứ tự index
  const msgIds = Array.from({ length: 8 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));
  const fileIds = Array.from({ length: 8 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000001${i}`));

  // Mock tin nhắn và file
  mockMessages = msgIds.map((id, index) => ({
    _id: id,
    conversationId,
    attachments: [fileIds[index]],
    createdAt: new Date(2026, 6, 17, 10, index)
  }));

  mockFiles = fileIds.map((id, index) => ({
    _id: id,
    originalName: `file-${index}.png`,
    mimeType: index % 2 === 0 ? "image/png" : "video/mp4", // Đều là media
    size: 1024,
    url: `http://url-${index}`
  }));

  // Limit = 5
  const res = await resourceService.loadMedia(conversationId, 5);

  // Vì sort giảm dần nên 5 ảnh đầu tiên sẽ thuộc về các tin nhắn từ index 7, 6, 5, 4, 3
  assert.equal(res.items.length, 5);
  assert.equal(res.items[0]._id, fileIds[7].toString());
  assert.equal(res.items[0].messageId, msgIds[7].toString());
  assert.equal(res.hasMore, true);
  // nextCursor sẽ là id của tin nhắn cuối cùng được gom (ở đây là msgIds[3])
  assert.equal(res.nextCursor, msgIds[3].toString());
});

test("loadMedia - lọc bỏ các file không phải ảnh/video (ví dụ pdf, docx)", async () => {
  const conversationId = "conv-123";
  const msgIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));
  const fileIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000001${i}`));

  mockMessages = msgIds.map((id, index) => ({
    _id: id,
    conversationId,
    attachments: [fileIds[index]],
    createdAt: new Date()
  }));

  mockFiles = [
    { _id: fileIds[0], originalName: "img.png", mimeType: "image/png", url: "url" },
    { _id: fileIds[1], originalName: "doc.pdf", mimeType: "application/pdf", url: "url" }, // Bị lọc bỏ
    { _id: fileIds[2], originalName: "vid.mp4", mimeType: "video/mp4", url: "url" },
    { _id: fileIds[3], originalName: "text.txt", mimeType: "text/plain", url: "url" } // Bị lọc bỏ
  ];

  const res = await resourceService.loadMedia(conversationId, 6);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0]._id, fileIds[2].toString()); // img.png và vid.mp4 (vid.mp4 mới hơn do index 2)
  assert.equal(res.items[1]._id, fileIds[0].toString());
  assert.equal(res.hasMore, false);
});

test("loadMedia - áp dụng đúng visibilityFilter từ userId", async () => {
  const conversationId = "conv-123";
  const userId = new mongoose.Types.ObjectId();
  const msgIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));
  const fileIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000001${i}`));

  const deletedAt = new Date("2026-07-17T02:00:00Z");

  mockMessages = msgIds.map((id, index) => ({
    _id: id,
    conversationId,
    attachments: [fileIds[index]],
    createdAt: new Date(`2026-07-17T0${index + 1}:00:00Z`) // Tương ứng 01:00, 02:00, 03:00, 04:00
  }));

  mockFiles = fileIds.map((id, index) => ({
    _id: id,
    originalName: `img-${index}.png`,
    mimeType: "image/png",
    url: "url"
  }));

  // Cấu hình participant soft-delete tại deletedAt (02:00)
  mockParticipants = [{
    legacyConversationId: conversationId,
    userId: userId,
    state: { deletedAt }
  }];

  const res = await resourceService.loadMedia(conversationId, 6, null, userId);

  // Chỉ lấy tin nhắn index 2 (03:00) và index 3 (04:00)
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0]._id, fileIds[3].toString());
  assert.equal(res.items[1]._id, fileIds[2].toString());
});

test("loadMedia - phân trang cursor-based chính xác", async () => {
  const conversationId = "conv-123";
  const msgIds = Array.from({ length: 5 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));
  const fileIds = Array.from({ length: 5 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000001${i}`));

  mockMessages = msgIds.map((id, index) => ({
    _id: id,
    conversationId,
    attachments: [fileIds[index]],
    createdAt: new Date()
  }));

  mockFiles = fileIds.map((id, index) => ({
    _id: id,
    originalName: `img-${index}.png`,
    mimeType: "image/png",
    url: "url"
  }));

  // Trang đầu tiên: limit = 2 (sẽ lấy msg4 và msg3)
  const res1 = await resourceService.loadMedia(conversationId, 2);
  assert.equal(res1.items.length, 2);
  assert.equal(res1.items[0]._id, fileIds[4].toString());
  assert.equal(res1.items[1]._id, fileIds[3].toString());
  assert.equal(res1.hasMore, true);
  assert.equal(res1.nextCursor, msgIds[3].toString()); // nextCursor của trang 1 là msgIds[3]

  // Trang tiếp theo: cursor = res1.nextCursor (msgIds[3]), query < msgIds[3]
  // Sẽ lấy các tin nhắn msg2 và msg1 (không sót msg2 nữa)
  const res2 = await resourceService.loadMedia(conversationId, 2, res1.nextCursor);
  assert.equal(res2.items.length, 2);
  assert.equal(res2.items[0]._id, fileIds[2].toString());
  assert.equal(res2.items[1]._id, fileIds[1].toString());
  assert.equal(res2.hasMore, true);
  assert.equal(res2.nextCursor, msgIds[1].toString());
});

test("loadFiles - tải đúng tài liệu đính kèm (không phải image/video) và phân trang", async () => {
  const conversationId = "conv-123";
  const msgIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));
  const fileIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000001${i}`));

  mockMessages = msgIds.map((id, index) => ({
    _id: id,
    conversationId,
    attachments: [fileIds[index]],
    createdAt: new Date()
  }));

  mockFiles = [
    { _id: fileIds[0], originalName: "doc1.pdf", mimeType: "application/pdf", size: 100, url: "url1" },
    { _id: fileIds[1], originalName: "img1.png", mimeType: "image/png", size: 200, url: "url2" }, // Bị lọc bỏ
    { _id: fileIds[2], originalName: "doc2.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 300, url: "url3" },
    { _id: fileIds[3], originalName: "vid1.mp4", mimeType: "video/mp4", size: 400, url: "url4" } // Bị lọc bỏ
  ];

  const res = await resourceService.loadFiles(conversationId, 5);
  // Sắp xếp giảm dần, nên thứ tự tin nhắn là msg3 (vid1 - lọc), msg2 (doc2), msg1 (img1 - lọc), msg0 (doc1)
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0]._id, fileIds[2].toString());
  assert.equal(res.items[0].originalName, "doc2.docx");
  assert.equal(res.items[1]._id, fileIds[0].toString());
  assert.equal(res.items[1].originalName, "doc1.pdf");
  assert.equal(res.hasMore, false);
});

test("loadLinks - tải đúng danh sách liên kết và phân trang cursor-based", async () => {
  const conversationId = "conv-123";
  const msgIds = Array.from({ length: 4 }, (_, i) => new mongoose.Types.ObjectId(`60a7f1a1000000000000000${i}`));

  mockMessages = [
    {
      _id: msgIds[0],
      conversationId,
      hasLink: true,
      links: [{ url: "https://google.com/search", hostname: "google.com" }],
      createdAt: new Date()
    },
    {
      _id: msgIds[1],
      conversationId,
      hasLink: false,
      links: [],
      createdAt: new Date()
    },
    {
      _id: msgIds[2],
      conversationId,
      hasLink: true,
      links: [{ url: "http://facebook.com/profile", hostname: "facebook.com" }],
      createdAt: new Date()
    },
    {
      _id: msgIds[3],
      conversationId,
      hasLink: true,
      links: [{ url: "https://news.ycombinator.com", hostname: "news.ycombinator.com" }],
      createdAt: new Date()
    }
  ];

  // Limit = 2, trang đầu tiên (lấy msg3 và msg2)
  const res1 = await resourceService.loadLinks(conversationId, 2);
  assert.equal(res1.items.length, 2);
  assert.equal(res1.items[0].url, "https://news.ycombinator.com");
  assert.equal(res1.items[0].messageId, msgIds[3].toString());
  assert.equal(res1.items[1].url, "http://facebook.com/profile");
  assert.equal(res1.items[1].messageId, msgIds[2].toString());
  assert.equal(res1.hasMore, true);
  assert.equal(res1.nextCursor, msgIds[2].toString());

  // Trang tiếp theo
  const res2 = await resourceService.loadLinks(conversationId, 2, res1.nextCursor);
  assert.equal(res2.items.length, 1);
  assert.equal(res2.items[0].url, "https://google.com/search");
  assert.equal(res2.items[0].messageId, msgIds[0].toString());
  assert.equal(res2.hasMore, false);
});

