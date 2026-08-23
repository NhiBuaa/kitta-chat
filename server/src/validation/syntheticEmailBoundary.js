const { isValidEmailFormat } = require("./emailFormat");

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const UNICODE_DOT_LOOKALIKE = /[\u3002\uFF0E\uFF61]/u;
const ASCII_DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const rejected = (rejectionClass) => ({
  accepted: false,
  normalizedEmail: undefined,
  rejectionClass,
});

const normalizeRegistrationEmail = ({ email, syntheticOnly = false } = {}) => {
  if (email === undefined || email === null || email === "") {
    return rejected("required");
  }
  if (typeof email !== "string") return rejected("type");
  if (email.trim() !== email || /\s/u.test(email)) return rejected("whitespace");
  if (CONTROL_OR_FORMAT.test(email)) return rejected("control_or_format");
  if (UNICODE_DOT_LOOKALIKE.test(email)) return rejected("unicode_dot_separator");

  const firstAt = email.indexOf("@");
  if (firstAt <= 0 || firstAt !== email.lastIndexOf("@")) {
    return rejected("at_separator");
  }

  const normalizedEmail = email.toLowerCase();
  if (!isValidEmailFormat(normalizedEmail)) return rejected("email_format");
  if (!syntheticOnly) return { accepted: true, normalizedEmail };

  const localPart = normalizedEmail.slice(0, firstAt);
  const domain = normalizedEmail.slice(firstAt + 1);
  const labels = domain.split(".");
  if (localPart.includes(":") || localPart.includes("/") || localPart.includes("\\")) {
    return rejected("userinfo_like_local_part");
  }
  if (
    labels.length < 2
    || labels.at(-1) !== "test"
    || labels.some((label) => !ASCII_DOMAIN_LABEL.test(label))
  ) {
    return rejected("synthetic_domain");
  }

  return { accepted: true, normalizedEmail };
};

module.exports = { normalizeRegistrationEmail };
