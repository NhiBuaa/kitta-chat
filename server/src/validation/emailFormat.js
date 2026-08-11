const MAX_EMAIL_LENGTH = 254;

const isValidEmailFormat = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  if (/\s/.test(value)) return false;

  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;

  const domain = value.slice(atIndex + 1);
  const lastDotIndex = domain.lastIndexOf(".");
  return lastDotIndex > 0 && lastDotIndex < domain.length - 1;
};

module.exports = {
  MAX_EMAIL_LENGTH,
  isValidEmailFormat,
};
