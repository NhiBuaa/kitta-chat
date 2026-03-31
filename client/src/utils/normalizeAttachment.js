/**
 * Chuẩn hóa object attachment từ nhiều nguồn khác nhau
 * (upload queue, socket payload, DB response) về cùng một shape
 */
export const normalizeAttachment = (attachment) => ({
    _id: attachment?.dbFileId || attachment?._id,
    url: attachment?.url || attachment?.cdnUrl || "",
    mimeType:
        attachment?.mimeType ||
        attachment?.type ||
        attachment?.file?.type ||
        "",
    originalName:
        attachment?.originalName ||
        attachment?.name ||
        attachment?.file?.name ||
        "Tep dinh kem",
    size: attachment?.size || attachment?.file?.size || 0,
});