const getSafeUserName = (user) => {
  if (!user) return "Người dùng";

  const displayName = typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (displayName) return displayName;

  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (username) return username;

  return "Người dùng";
};

module.exports = getSafeUserName;
