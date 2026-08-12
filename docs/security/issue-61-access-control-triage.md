# Issue #61 Access-Control Triage Observations

## Status

Historical pre-remediation triage. Issue #61 closed with M1 and M2 `MESSAGE ACCESS-CONTROL REMEDIATED / VERIFIED BY SOURCE-AUTHORIZATION-TEST EVIDENCE`. Current behavior requires authenticated-principal authority, authorizes direct/group access, validates group ObjectId receivers, bounds history queries, and applies route-specific Redis admission. The original observations below remain evidence of the former source state; they are not current behavior. See [issue-61-final-remaining-risk-record.md](issue-61-final-remaining-risk-record.md).

## Message Creation Trusts Caller Identity

`POST /api/messages` is mounted without `authMiddleware`. `createMessage` reads `sender`, `receiver`, `isGroup`, `type`, text, and attachments from the request body, derives the conversation identifier from those values, and persists the message without binding `sender` to an authenticated principal or checking direct/group membership.

The route is reachable through nginx's `/api/` proxy. Source behavior creates possible sender impersonation, unauthorized direct/group conversation writes, system-style message integrity impact and use of caller-selected attachment identifiers. Treat this as a high-confidence access-control and integrity observation; do not claim successful runtime exploitation without focused reproduction under separate authorization.

Recorded Issue #61 disposition: `source-confirmed message write-integrity/access-control finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.

## Message History Uses Caller-Controlled Identity

`GET /api/messages/:userId1/:userId2` is also mounted without `authMiddleware`. `getMessages` derives the direct conversation identifier from both path parameters, or uses `userId2` as the group conversation identifier when `isGroup=true`. It then selects the visibility identity with `req.user?.id || userId1`.

Because route middleware does not populate `req.user`, an unauthenticated caller controls `userId1`. If a matching `ConversationParticipant` exists, the caller can select that participant's visibility bounds; if no participant exists or the lookup errors, the controller deliberately falls back to an empty visibility filter and queries the selected conversation. The response populates sender and attachment data, and the caller-controlled `limit` has no server-side maximum.

The route is reachable through nginx's `/api/` proxy. Treat this as a high-confidence horizontal authorization/data-disclosure observation with an additional resource-amplification concern from the uncapped caller-supplied `limit`; do not claim successful runtime exploitation without focused reproduction under separate authorization. Rate limiting cannot substitute for authentication, principal binding, membership authorization, or a bounded query limit.

Recorded Issue #61 disposition: `source-confirmed horizontal-authorization/data-disclosure and resource-amplification finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.

## Authenticated Sync Contrast

`GET /api/messages/sync` is mounted with `authMiddleware`, derives its identity from `req.user`, caps the requested message count at 200, and constructs eligible conversations from the authenticated user's groups and participant rows. Its query can still fan out and belongs in expensive-read rate-limit classification, but it does not share the two missing-auth route-wiring observations above.

## Non-Goals Of This Observation

- Do not add middleware or change controller behavior during the Issue #61 grill.
- Do not dismiss or reclassify CodeQL alerts solely from this document.
- Do not let rate-limit coverage stand in for access-control remediation.
- Do not describe the B/B scope split as remediation, resolution, dismissal, false-positive or duplicate disposition.
- Do not create/publish the combined follow-up until separately authorized. Replace the placeholder only after an actual identifier exists.
- Do not finalize a stable network-actor Redis contract for either route while authentication/authorization semantics remain unresolved.
