# Issue #61 Closure Tranche 1 — Human Implementation Authorization Gate

## Status

**Implementation-authorized and source-remediated; scanner confirmation pending.** Focused tests, full server/client suites, client lint CI, and client build pass. Local CodeQL is unavailable, so none of the eight alerts is manually dismissed or marked scanner-verified. This narrow static-security tranche excludes operational-endpoint exposure, query/input alerts, Gitleaks/credential rotation, dependency/license changes, rate-limit enforcement, M1/M2, reset-token remediation, and Level 2A/2B work.

## TDD evidence classification

The retained RED evidence has two meanings and must not be conflated:

| Alert(s) | Retained RED classification | Evidence boundary |
| --- | --- | --- |
| #97 backend ReDoS | `SCAFFOLDING RED` | The new email-validator import/module did not yet exist. No retained pre-fix behavioral timing/result test proves the old regex's polynomial path. |
| #26 client regex range | `SCAFFOLDING RED` | The new display-name validation module did not yet exist. No retained pre-fix behavioral test proves acceptance of every unintended range character. |
| #6 CORS | `BEHAVIORAL RED` for the HTTP origin test; `SCAFFOLDING RED` for the new policy-module import | Before the fix, an unlisted suffix origin received `Access-Control-Allow-Origin` by reflection. The separate absent-module failure proves only test scaffolding. |
| #7–#9 tainted log format | `BEHAVIORAL RED` | Existing console calls did not invoke the expected fixed structured logger event; retained output also showed format-control text affecting the old console output. |
| #27–#28 stack/error exposure | `BEHAVIORAL RED` | Controller tests observed the caught `Error` object, including its stack, in the external response before the safe boundary was added. |

No historical RED is reconstructed beyond retained command output. `SCAFFOLDING RED` is not evidence that the vulnerability was reproduced.

## Scope

| Category | CodeQL alerts | Included seam |
| --- | --- | --- |
| T1-A — backend polynomial ReDoS | #97 | `server/src/controllers/authController.js` |
| T1-B — client overly-large regex range | #26 | `client/src/features/auth/pages/Register.jsx` |
| T1-C — tainted log format | #7, #8, #9 | Conversation read-model, overview, and presence services |
| T1-D — stack/error exposure | #27, #28 | `server/src/controllers/messageController.js` |
| T1-E — CORS origin policy | #6 | `server/src/app.js`, `server/src/config/env.js`, and focused tests |

This scope is **five categories and eight CodeQL alerts**. No alert is dismissed manually; scanner rerun is verification rather than the definition of correctness.

## Security and behavior contracts

### T1-A — Backend ReDoS (#97)

`validateEmail` converts caller-controlled input to a string, lowercases it, then runs `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` at `authController.js:17-19`. CodeQL demonstrates a polynomial path for strings beginning `!@!.` with many `!.` repetitions. The JSON parser's 10kb request limit does not make this an appropriate email-validation bound.

The minimum remediation is a bounded, deterministic email-format check: reject non-string input and input longer than the standard 254-character email-address maximum, then validate local-part, single `@`, domain labels, dot presence, and whitespace without a backtracking pattern. It must preserve the currently accepted ordinary `local@domain.tld` contract; it is not a deliverability check.

Compatibility risk: malformed addresses formerly accepted by the permissive regex, especially overlong values, will reject. That is the intended security/format correction. Stop if source review shows a public API contract that deliberately accepts values outside this format.

Required proof: a focused server test must cover ordinary valid/invalid values, the 254/255 boundary, and CodeQL's adversarial near-miss family without a slow regex path; related auth HTTP regression tests must still pass.

### T1-B — Client overly-large regex range (#26)

At `Register.jsx:78`, the display-name validator uses `/^[A-Za-zÀ-ỹà-ỹ\s]+$/`. `À-ỹ` already spans U+00C0 through U+1EF9; the second range overlaps it. That broad interval unintentionally includes characters outside the UI's existing stated contract, “letters and whitespace,” which triggers CodeQL #26.

The remediation must use disjoint intentional Latin/Vietnamese ranges while keeping the existing 2–30-character boundary and whitespace-only rejection. A candidate shape is `A-Za-z`, `À-Ö`, `Ø-ö`, `ø-ÿ`, and `\u0100-\u1EFF`, plus whitespace. It preserves the existing user-facing contract without using a new display-name restriction to address logging.

Compatibility risk: names containing characters admitted only by the accidental U+00C0–U+1EF9 span will fail client validation. Stop if static contract review finds that such characters are a documented supported product contract or that server validation/persisted-data behavior makes the correction a public migration.

Required proof: a focused client validation test must accept representative Latin and Vietnamese names, reject whitespace-only input and characters outside the intended ranges, and keep 2/30 boundaries. A small pure validation helper is permitted if needed to make this testable.

### T1-C — Tainted log formats (#7–#9)

The invariant is: **untrusted user-controlled text remains data, never logging format or control structure.** It applies even if text contains `%`, newlines, Unicode, or punctuation. It does not justify narrowing a product input contract.

| Alert | Source location and root cause | Minimum remediation | Required proof |
| --- | --- | --- | --- |
| #7 `js/tainted-format-string` | `conversationReadModelService.js:315` interpolates externally influenced `action` and `groupId` into the first argument of `console.error`. | Use a static error message/template; pass reviewed diagnostic values only as data arguments or structured fields. | Mock the logger/console with `%`, newline, and Unicode inputs; assert a fixed first argument and preserved diagnostic data. |
| #8 `js/tainted-format-string` | `overviewService.js:32` interpolates `otherUserId`, derived from `conversationId`, into the first argument of `console.error`. | Same static-template/data-position rule. | Exercise the presence-error path with format-control input; assert no caller text is the format argument. |
| #9 `js/tainted-format-string` | `presenceService.js:133` interpolates a Redis key derived from `userId` into the first argument of `console.warn`. | Same static-template/data-position rule. | Exercise the Redis-error fallback with format-control input; assert a fixed first argument and unchanged fallback behavior. |

Existing logging conventions may be used; no logging-framework migration is authorized. No raw credential/token may enter a log field. Identifiers remain diagnostic data only, never a format string.

### T1-D — Stack/error exposure (#27–#28)

| Alert | Source location and root cause | Minimum remediation | Required proof |
| --- | --- | --- | --- |
| #27 `js/stack-trace-exposure` | `messageController.js:65` returns `res.status(500).json(err)` from `createMessage`. | Preserve the 500 failure status but return a fixed structured internal-error response instead of the caught object. | Trigger a representative create failure; response contains no stack, error object, filesystem path, dependency detail, or secret-bearing detail. |
| #28 `js/stack-trace-exposure` | `messageController.js:124` returns `res.status(500).json(err)` from `getMessages`. | Same response boundary for this path. | Trigger a representative read failure and make the same absence assertions. |

Useful server-side diagnostics must remain available through existing safe logging conventions. This tranche must not change a correct application status merely to hide details. If a client is proven to depend on a safe existing code/message, preserve it where practical; stop if it depends on internal exception serialization.

### T1-E — CORS exact-origin policy (#6)

At `app.js:61-76`, middleware copies `Accept` to `Origin` when `Origin` is absent, then configures `cors({ origin: true, credentials: true })`. This allows reflected arbitrary origins and pairs them with credential-compatible CORS behavior, causing CodeQL #6 at line 70.

The approved planning contract is an **exact-origin configuration allowlist**:

- A browser request with `Origin` receives CORS permission only when its origin exactly equals one reviewed configured origin: same scheme, host, and port.
- Do not use `origin: true`, arbitrary reflection, wildcard with credentials, regex, suffix matching, or aliases.
- A non-allowlisted `Origin` receives no CORS permission. This is not authentication or authorization, so requests without `Origin` continue to routes for same-origin, health-check, server-to-server, and tooling use.
- Credential-compatible CORS headers are returned only for exact allowed origins, following the application's existing credential requirement.
- Remove the `Accept`-to-`Origin` synthesis. `Accept` is not an origin signal.
- Define a reviewed `CORS_ALLOWED_ORIGINS` configuration as a finite comma-separated list of absolute web origins. Each entry must parse as an `http:` or `https:` origin, contain no path/query/fragment/userinfo, canonicalize to exactly itself, and be deduplicated.
- Local and test origin lists are explicit environment/test configuration. No Railway or public-demo URL is hard-coded. `URL_FRONTEND`, used for public-link behavior, is not an implicit replacement for this CORS allowlist.
- In non-development runtime, missing, blank, or malformed CORS configuration must fail startup through server environment validation. It must never fall back to reflected or arbitrary origins. Test injection may supply an explicit allowlist without relying on process-global deployment values.

Compatibility risk: browsers hosted at an origin not explicitly configured lose cross-origin permission; no-Origin requests do not. Stop if the current server's startup/configuration architecture cannot carry an explicit reviewed allowlist without broader deployment/configuration redesign.

Required proof: focused app/config tests must cover valid exact origins; rejected lookalike scheme/host/port origins; credential header absence for rejected origins; no-Origin route access without CORS permission; `Accept` not becoming `Origin`; and startup rejection for missing/malformed production configuration. Run related HTTP integration tests after the focused suite.

## Stop conditions

Implementation must stop and return for a new decision if a proposed fix requires any of the following:

- public API or schema redesign;
- authentication or authorization changes;
- credential rotation or a new secret;
- a new external dependency or deployment topology;
- logging-framework migration;
- an unrelated broad validation policy;
- rate-limit implementation;
- query-semantics redesign; or
- an operational-endpoint (`/ops`, health, or metrics) access-policy decision.

Small internal refactors solely needed to test a listed fix are allowed only when behavior remains inside the contracts above.

## Explicit exclusions and operational-endpoint gate

`/ops` remains `UNRESOLVED / REQUIRED FOR ISSUE #61 CLOSURE`, but is not part of Tranche 1. Current source exposes it without application authentication (`app.js:88-94`), and repository configuration may proxy it externally. Its disposition moves to a separate **operational-endpoint closure gate**, which must later consider source/topology evidence and choose network/ingress restriction, authenticated administrative access, disablement outside an authorized operational environment, or an explicit risk disposition. `/metrics` and health endpoints are reviewed there only if that gate's inventory requires them.

## Verification after authorization A

Use TDD/red evidence where practical, focused tests for each finding, related server/client regressions, applicable lint/syntax/type checks, local CodeQL or equivalent verification where available, and `git diff --check`. A green scanner never resolves unrelated Issue #61 findings.

## Human implementation decision

Choose exactly one:

- **A — Authorize Closure Tranche 1 static remediation implementation.** Authorizes only T1-A through T1-E, their focused/regression tests, and minimal supporting internal refactors.
- **B — Keep Closure Tranche 1 implementation on hold.** No implementation occurs.

Recommendation: **A**. Static source-to-alert mapping found no stop condition. This authorization would not cover any excluded workstream.

Respond exactly:

`Closure Tranche 1 implementation: A | B`
