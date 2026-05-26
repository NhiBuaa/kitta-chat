const jwt = require("jsonwebtoken");

const REFRESH_COOKIE_NAME = "kittachat_refresh";
const ACCESS_TOKEN_EXPIRES_IN = "1d";
const REFRESH_TOKEN_EXPIRES_IN = "7d";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return process.env.JWT_SECRET;
};

const getRefreshTokenSecret = () => process.env.REFRESH_TOKEN_SECRET || getJwtSecret();

const signAccessToken = (user) =>
  jwt.sign({ id: user._id }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

const signRefreshToken = (user) =>
  jwt.sign({ id: user._id, type: "refresh" }, getRefreshTokenSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

const verifyRefreshToken = (token) => jwt.verify(token, getRefreshTokenSecret());

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false",
  path: "/api/auth",
});

const setRefreshCookie = (res, token) => {
  if (typeof res.cookie !== "function") return;

  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...getCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
};

const clearRefreshCookie = (res) => {
  if (typeof res.clearCookie !== "function") return;

  res.clearCookie(REFRESH_COOKIE_NAME, getCookieOptions());
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});

const getRefreshTokenFromRequest = (req) =>
  parseCookies(req.headers.cookie || "")[REFRESH_COOKIE_NAME] || null;

const buildAuthUser = (user) => ({
  id: user._id,
  _id: user._id,
  displayName: user.displayName,
  email: user.email,
  avatar: user.avatar,
  status: user.status,
  activityStatus: user.activityStatus,
});

const issueAuthSession = (res, user) => {
  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken);
  return { token, user: buildAuthUser(user) };
};

module.exports = {
  REFRESH_COOKIE_NAME,
  buildAuthUser,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  issueAuthSession,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
};
