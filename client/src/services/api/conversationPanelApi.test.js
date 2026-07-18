import assert from "node:assert/strict";
import test from "node:test";
import { axiosClient } from "./axiosClient.js";
import { getPanelResources } from "./conversationPanelApi.js";

test("getPanelResources constructs URL with both scopes and cursor", async () => {
  const originalGet = axiosClient.get;
  let requestedUrl = null;

  // Stub axiosClient.get
  axiosClient.get = async (url, config) => {
    requestedUrl = url;
    return { data: { success: true } };
  };

  try {
    await getPanelResources("conv-123", "media", "cursor-456");
    assert.equal(requestedUrl, "/api/conversations/conv-123/panel/resources?scopes=media&cursor=cursor-456");
  } finally {
    // Restore original method
    axiosClient.get = originalGet;
  }
});

test("getPanelResources handles query string when only cursor is provided", async () => {
  const originalGet = axiosClient.get;
  let requestedUrl = null;

  // Stub axiosClient.get
  axiosClient.get = async (url, config) => {
    requestedUrl = url;
    return { data: { success: true } };
  };

  try {
    await getPanelResources("conv-123", "", "cursor-789");
    assert.equal(requestedUrl, "/api/conversations/conv-123/panel/resources?cursor=cursor-789");
  } finally {
    // Restore original method
    axiosClient.get = originalGet;
  }
});
