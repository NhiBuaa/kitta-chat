const express = require("express");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
const { createHttpRateLimitMiddleware: sameNameLimiterFactory } = require("../rateLimit/sameNameMiddleware");

const app = express();

function lookAlikeMiddleware(_req, _res, next) {
  next();
}

function expensiveHandler(_req, res) {
  res.sendFile("/var/app/expensive-resource");
}

const canonicalLimiter = createHttpRateLimitMiddleware({ policyIds: ["read_expensive.message_history"] });
const canonicalAliasLimiter = createHttpRateLimitMiddleware({ policyIds: ["read_expensive.message_history"] });
const sameNameLimiter = sameNameLimiterFactory({ policyIds: ["read_expensive.message_history"] });

app.get("/protected", canonicalLimiter, expensiveHandler);
app.get("/protected-alias", canonicalAliasLimiter, expensiveHandler);
app.get("/unprotected", expensiveHandler);
app.get("/after-controller", expensiveHandler, canonicalLimiter);
app.get("/look-alike", lookAlikeMiddleware, expensiveHandler);
app.get("/same-name", sameNameLimiter, expensiveHandler);
