# Issue #61 Reset-Token Logging Triage

## Status

- Issue #61 disposition: **source-confirmed credential-in-URL/log-exposure finding — remediation deferred to dedicated security follow-up; historical occurrence unverified**.
- Follow-up status: `blocking follow-up linkage required / identifier pending`.
- Confidence: high for the source/config exposure model.
- Historical occurrence: not inspected and not claimed.
- Historical secret incident: not established.
- Runtime remediation: not authorized.
- Publication/dismissal: not authorized.
- Measurement safety: raw auth/recovery request logs are `restricted/quarantined for measurement use`.
- Scope decision: recorded as Decision 1 B in `docs/security/issue-61-human-decision-gate.md`.

## Source-confirmed observation

The password-reset design places the reset credential in both the emailed frontend URL and the backend API URL. Normal reset-link use can therefore reach multiple configured logging sinks without requiring a backend reset error.

If this path/configuration design is deployed, opening the reset link is sufficient to send a credential-bearing frontend request target through the active Nginx access-log configuration. Submitting the reset form sends another credential-bearing request target to Nginx and the backend request logger. This is a source/config exposure claim, not a historical-occurrence claim.

## Evidence chain

### Credential creation and frontend route

- `server/src/controllers/authController.js` creates a reset JWT with `expiresIn: "15m"`. The token is an active security credential during that validity period.
- The email URL shape is `<URL_FRONTEND>/reset-password/<USER_ID>/<RESET_TOKEN>`. No example or token value is recorded in this triage.
- `client/src/app/router.jsx` mounts `/reset-password/:id/:token` as a normal frontend route.
- Opening the emailed link therefore sends the credential-bearing frontend request target to the web ingress before the user submits the backend reset API request.

### Nginx access logging and referrer propagation

- `nginx/nginx.conf` defines active `log_format main` with `"$request"`.
- The same format records `$http_referer`.
- The same config enables `access_log /var/log/nginx/access.log main buffer=16k flush=2s` at HTTP scope.
- The frontend reset route uses normal `location /`; `access_log off` applies to the Nginx-local health path and nested static-asset location, not the reset-page document request.
- Opening the reset link can therefore emit the credential-bearing frontend request target through `$request` even if the backend reset API is never called.
- `POST /api/auth/reset-password/:id/:token` is additionally handled by the auth proxy location and can emit its own credential-bearing request target.
- Nginx sets `Referrer-Policy: no-referrer-when-downgrade` and records `$http_referer`. Depending on browser/request context, subsequent requests from the reset page can therefore provide an additional credential-bearing referrer propagation path. Static source proves the policy and log field, not that a particular browser emitted or a sink retained such a referrer.
- No repository Nginx rule redacts the reset-password path segment from `$request` or `$http_referer` before access logging.

### Backend request and error logging

- `server/src/routes/auth.js` mounts `POST /reset-password/:id/:token` under `/api/auth`.
- `server/src/app.js` installs `createRequestLoggingMiddleware` before JSON parsing and auth route dispatch.
- `server/src/middlewares/requestLogging.js` derives `requestPath` from `(req.originalUrl || req.url).split("?", 1)[0]` and emits it as field `path` when the response finishes.
- The application error middleware independently emits the same query-stripped `req.originalUrl || req.url` as field `path`.
- `server/src/utils/logger.js` removes fields whose key name matches its sensitive-field pattern. For a field named `path`, it strips only the query string; it does not redact path parameters or recognize that the reset token occupies a path segment.
- Request-ID/correlation context does not redact the path before either backend log call.

## Security consequence

If Nginx or backend output is retained, forwarded or exposed to operators/systems beyond the minimum required set, a valid reset token and its associated user-path identifier can be disclosed through logs. Source shows that the reset controller accepts the path token as the credential used to authorize password replacement. Exposure during the token's validity can therefore create an account-takeover path for a party able to read the affected log record.

Retention, access scope and historical occurrence are unknown because raw logs were not opened. Those unknowns affect realized exposure, not the source-confirmed logging capability.

## Source-confirmed exposure versus historical incident

Source/config evidence establishes:

- a credential-bearing frontend link and API route;
- active Nginx request/referrer logging fields that can receive those URLs;
- backend request/error path logging that does not redact path segments;
- normal reset-link use as sufficient input to the Nginx exposure surface.

This evidence does **not** establish:

- that a specific token exists in retained logs;
- that production retains these logs;
- that an attacker or unauthorized party accessed a log;
- that a currently valid credential has leaked.

Those are historical secret-incident questions and were intentionally not investigated through raw logs.

## Measurement-source safety

Raw Nginx and backend auth/recovery request logs are classified `restricted/quarantined for measurement use` until the maintainer approves both secret-bearing-log handling and a safe extraction/redaction procedure.

Therefore:

- do not open or sample them for rate-limit evidence;
- do not extract raw paths or referrers;
- do not treat generic future authorization to “read production logs” as sufficient;
- do not use them for aggregate evidence unless a specific procedure proves credentials and PII cannot leave the controlled extraction boundary.

This is a planning evidence classification. It does not delete logs, change retention, invalidate tokens or modify logging.

## Adjacent PII/privacy logging observation

This is separate from the reset-token credential exposure.

- On a forgot-password queue-publish failure, `server/src/controllers/authController.js` calls `console.error` with normalized email and user ID fields.
- Email and user ID are PII/account identifiers, not equivalent to an active reset credential.
- The source-confirmed PII logging path strengthens the requirement for privacy-safe auth/recovery evidence handling.
- Historical occurrence, retention and access were not inspected. This observation does not automatically broaden Issue #61 remediation scope.

## Relationship to existing security acceptance criteria

- `.agents/rules/security-findings.md` prohibits secret values in logs and evidence artifacts.
- Issue #61 acceptance requires static log messages with structured/separate data while preserving correlation IDs and secret redaction. That criterion must cover credentials embedded in route paths, not only sensitive field names, request bodies, headers and query strings.
- Any remediation design must consider the emailed/frontend URL, Nginx request and referrer logging, backend API URL, backend request/error logging and historical retained-log disposition. Fixing only one sink leaves other exposure surfaces.

## Recorded follow-up disposition

- Remediation is separated into a dedicated security follow-up because the finding crosses token design, the email reset URL, frontend and backend route contracts, Nginx request/referrer logging, backend path logging, redaction and historical retained-log disposition.
- Splitting scope does not remediate, resolve or dismiss the finding.
- Issue #61 retains the finding, current risk status, separation rationale, remaining-risk accounting and a blocking requirement to add the follow-up linkage. The finding must not disappear from Issue #61 final inventory.
- No actual cross-reference exists yet. When authorized creation/publication produces a stable identifier, replace `blocking follow-up linkage required / identifier pending` with the actual link/reference. This planning step does not create or publish that issue.

The follow-up must review at least:

1. Immediate logging containment/redaction.
2. Whether reset credentials should remain in URL paths.
3. Frontend/API migration and compatibility.
4. Referrer-policy consequences.
5. Historical retained-log discovery/disposition.
6. Secret-bearing-log access controls.
7. Regression verification without exposing token values.

A narrow logging-containment stage may later be approved independently; protocol redesign is not required in the same commit.

This triage does not select a remediation mechanism, inspect historical logs, rotate/reset credentials, change the reset URL contract or modify runtime logging.
