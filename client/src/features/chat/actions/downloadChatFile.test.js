import assert from "node:assert/strict";
import test from "node:test";

import { runChatFileDownload } from "./downloadChatFile.js";
import { requestFileDownloadUrl } from "../../../services/api/fileApi.js";
import { axiosClient } from "../../../services/api/axiosClient.js";

test("chat file download requests a signed URL and triggers a hidden anchor", async () => {
  const requests = [];
  const appended = [];
  const anchor = {
    href: "",
    rel: "",
    style: {},
    clicked: false,
    removed: false,
    click() {
      this.clicked = true;
    },
    remove() {
      this.removed = true;
    },
  };
  const documentObject = {
    createElement(tagName) {
      assert.equal(tagName, "a");
      return anchor;
    },
    body: {
      appendChild(element) {
        appended.push(element);
      },
    },
  };

  const result = await runChatFileDownload({
    fileId: "file-1",
    messageId: "message-1",
    requestDownloadUrl: async (fileId, messageId) => {
      requests.push({ fileId, messageId });
      return { url: "https://signed.example/download" };
    },
    documentObject,
  });

  assert.equal(result, true);
  assert.deepEqual(requests, [{ fileId: "file-1", messageId: "message-1" }]);
  assert.deepEqual(appended, [anchor]);
  assert.equal(anchor.href, "https://signed.example/download");
  assert.equal(anchor.rel, "noopener noreferrer");
  assert.equal(anchor.style.display, "none");
  assert.equal(anchor.clicked, true);
  assert.equal(anchor.removed, true);
});

test("file download API posts the attachment message context", async () => {
  const originalPost = axiosClient.post;
  const requests = [];
  axiosClient.post = async (url, body) => {
    requests.push({ url, body });
    return { data: { url: "https://signed.example/download" } };
  };

  try {
    const result = await requestFileDownloadUrl("file-1", "message-1");

    assert.deepEqual(result, { url: "https://signed.example/download" });
    assert.deepEqual(requests, [
      {
        url: "/api/files/file-1/download-url",
        body: { messageId: "message-1" },
      },
    ]);
  } finally {
    axiosClient.post = originalPost;
  }
});

