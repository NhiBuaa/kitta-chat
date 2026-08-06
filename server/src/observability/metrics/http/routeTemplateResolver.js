const joinRoutePath = (baseUrl, routePath) => {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const route = String(routePath || "").replace(/^\/+/, "");
  const joined = [base, route].filter(Boolean).join("/");
  return joined ? (joined.startsWith("/") ? joined : `/${joined}`) : "/";
};

const resolveRouteTemplate = (req = {}) => {
  if (!req.route) return undefined;

  return joinRoutePath(req.baseUrl, req.route.path);
};

module.exports = {
  joinRoutePath,
  resolveRouteTemplate,
};
