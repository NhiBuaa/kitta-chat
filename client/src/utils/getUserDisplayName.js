export const getUserDisplayName = (user) => {
  if (!user) return "Người dùng";

  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (displayName) return displayName;

  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name) return name;

  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (username) return username;

  return "Người dùng";
};
