import { toast } from "react-toastify";
import { requestFileDownloadUrl } from "../../../services/api/fileApi.js";

const getRuntimeDocument = () =>
  typeof document !== "undefined" ? document : null;

export const runChatFileDownload = async ({
  fileId,
  messageId,
  requestDownloadUrl = requestFileDownloadUrl,
  documentObject = getRuntimeDocument(),
}) => {
  if (!fileId || !messageId || !documentObject?.body) {
    return false;
  }

  const response = await requestDownloadUrl(fileId, messageId);
  if (!response?.url) {
    throw new Error("Missing signed download URL");
  }

  const anchor = documentObject.createElement("a");
  anchor.href = response.url;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  documentObject.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
};

export const downloadChatFile = async ({ fileId, messageId }) => {
  try {
    return await runChatFileDownload({ fileId, messageId });
  } catch (error) {
    console.error("Không thể tải tài liệu:", error);
    toast.error("Không thể tải tài liệu. Vui lòng thử lại.");
    return false;
  }
};
