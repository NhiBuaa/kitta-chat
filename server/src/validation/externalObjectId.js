const EXTERNAL_OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const isValidExternalObjectId = (value) =>
  typeof value === "string" && EXTERNAL_OBJECT_ID_PATTERN.test(value);

module.exports = {
  isValidExternalObjectId,
};
