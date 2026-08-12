export const takeResetTokenFromFragment = ({ location, history }) => {
  const token = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!token) return null;

  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return token;
};
