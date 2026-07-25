const PASSTHROUGH_URL_PATTERN = /^(https?:|blob:|data:)/;
const APP_STATIC_PATH_PATTERN = /^\/(?:demo-assets|uploads)\//;

export const resolveAvatarUrl = (
  avatarPath,
  { defaultAvatar = "", legacyBaseUrl = "/uploads" } = {},
) => {
  if (!avatarPath) return defaultAvatar;
  if (PASSTHROUGH_URL_PATTERN.test(avatarPath)) return avatarPath;
  if (APP_STATIC_PATH_PATTERN.test(avatarPath)) return avatarPath;

  const normalizedBaseUrl = legacyBaseUrl.replace(/\/$/, "");
  const normalizedAvatarPath = avatarPath.startsWith("/")
    ? avatarPath
    : `/${avatarPath}`;

  return `${normalizedBaseUrl}${normalizedAvatarPath}`;
};
