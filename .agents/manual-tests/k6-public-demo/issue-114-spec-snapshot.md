# Immutable Review Snapshot: GitHub Issue #114

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#114`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/114
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Source base: `79a2653464d0bf798b95222ec7434ce8722a696b`
- Captured at: `2026-08-23`
- Purpose: immutable Spec input for Test Cases, the manual guide, TDD, and the later single whole-K6 review

## Title

K6-04 — S3 upload boundary, prefix/private-object policy và image-worker storage path

## Body

### Parent

#110

### What to build

Deliver the private S3 upload and image-processing boundary using only the approved `uploads/*`
and `avatars/*` namespaces. Resolve the current `queue-sources/*` mismatch without broadening IAM,
keep durable objects private, and keep upload unavailable until the bounded D2 activation sequence
succeeds.

This slice uses mocked or local provider seams pre-D2. It must not create AWS keys, modify bucket
CORS, perform live S3 operations, publish an image, or deploy.

### Locked object-key and ownership contract

Only these server-generated key classes are valid:

- chat staging: `uploads/staging/chat/<ownerId>/<requestId>/<safeName>`;
- durable chat/file output: `uploads/files/<ownerId>/<requestOrSessionId>/<safeName>`;
- avatar staging: `avatars/staging/<ownerId>/<requestId>/<safeName>`;
- durable avatar output: `avatars/users/<ownerId>/<requestId>.webp`.

`ownerId`, `requestId`, session identity, and safe filename are produced or canonicalized by the
server. Empty segments, dot segments, backslashes, encoded traversal, absolute URLs, userinfo,
control characters, prefix confusion, and every key outside `uploads/*`/`avatars/*` fail before an
AWS SDK or queue call. `queue-sources/*` is removed; IAM is not broadened.

Image jobs carry the server-generated source class, owner, request ID, and exact staging key. The
worker validates that tuple before read/write/delete. It may delete only that validated staging key
and an output created by the current attempt. Duplicate/race handling must not delete a previously
durable output. Existing `fileProcessed` and `avatarUpdated` event names and payload field names,
request-id idempotency, and retry behavior remain stable. Public-demo does not use the remote
Google-avatar URL path because Google login is disabled; legacy-local behavior remains compatible.

### Locked upload envelope and multipart lifecycle

The exact allowlist is:

- images: `image/jpeg`, `image/png`, `image/webp`, `image/gif` — maximum 50 MiB;
- video: `video/mp4`, `video/webm`, `video/quicktime` — maximum 50 MiB;
- audio: `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm` — maximum 30 MiB;
- documents/archives: `application/pdf`, `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`,
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`,
  `application/zip`, and `application/x-rar-compressed` — maximum 30 MiB.

Blank MIME, wildcard MIME, unsupported subtypes, and `application/octet-stream` are rejected.
Boundary tests cover max-1, max, and max+1 bytes.

The existing endpoints and success response field names remain. To bind size before any direct S3
upload, public-demo initiation extends the existing `/api/files/init` request with required
`fileSize`; `fileName`, `fileType`, and `fileHash` retain their names. The client and server are
updated together. This is the only approved public request extension in this ticket; no caller-
controlled actor, key, bucket, or prefix is added.

MongoDB owns a multipart-session record containing authenticated owner ID, server key, provider
upload ID, original name, MIME, declared size, optional hash, expiry, state, and eventual File ID.
States are `initiated`, `completed`, `aborted`, and `expired`. Every part-sign, completion, and
internal abort requires the authenticated owner plus exact session/upload-ID/key match. Another
principal or a mismatched tuple receives no provider call.

Multipart uses 5 MiB parts, except the final part may be 1 byte through 5 MiB. Part numbers are
unique, contiguous, ordered from 1, and bounded by the declared size; at most 10 parts are possible.
Completion requires exactly the expected count and ordered non-empty bounded ETags. A second
completion of a completed session returns the same stored File through the existing success shape;
aborted/expired sessions cannot be revived. Abort remains server-internal for failed/expired
sessions; no new public abort route is introduced. Failure before S3 completion aborts once. Failure
after completion deletes only the session-owned newly completed object if no durable File owns it.

### Locked private-delivery contract

S3 objects remain private. `s3Key` (and an internal `avatarS3Key` for new S3 avatars) is the durable
object identity; a stored provider URL is never public delivery authority and is never returned raw.

- Documents keep `POST /api/files/:fileId/download-url` with response keys `{ url, originalName }`.
  After the existing authenticated conversation/visibility checks, it returns a 300-second signed
  GET URL.
- Inline chat image/video/file projections and avatar projections receive a fresh 300-second signed
  GET URL at the existing authorized REST or Socket.IO projection boundary. Existing `url`,
  `cdnUrl`, `avatar`, attachment, message, user, event, and response field names remain unchanged.
- Covered surfaces include file completion, `fileProcessed`, message/direct/group history and
  resource projections, profile/friend/group/sidebar/call participant avatars, and
  `avatarUpdated`. A central projection adapter must prevent a missed surface from returning a raw
  S3 location.
- Expiry is refreshed only by a later authorized API projection, Socket.IO projection, or existing
  authenticated download request. There is no anonymous key-based refresh and no public bucket URL
  fallback. Signing failure fails/suppresses the affected projection with a generic safe error or
  approved local avatar placeholder; it never exposes the durable/provider URL.

Local `demo-local/*` assets keep their same-origin behavior and are not S3 objects.

### Locked activation and error contract

Checked-in fixtures, candidate descriptors, backend state, and edge runtime document remain
`upload=false` pre-D2. The source contract may represent a later `upload=true` only when a non-secret
activation state is exactly `validated`; `false` requires `disabled`. Missing, malformed, or
mismatched backend/edge state fails closed. #114 owns this parser/capability transition; #117 owns
the checked-in service descriptors, which remain disabled. D2 may set `validated/true` only after
credential binding, internal provider checks, and exact-origin CORS; browser acceptance follows.

Rejections are secret-safe and retain existing success shapes:

| Condition | HTTP result |
| --- | --- |
| upload disabled | existing `404` / `CAPABILITY_DISABLED` |
| invalid name, MIME, size, key, part, or ETag envelope | `400` / `INVALID_UPLOAD_REQUEST` |
| missing or foreign multipart session | `404` / `UPLOAD_SESSION_NOT_FOUND` |
| aborted/expired/conflicting lifecycle | `409` / `UPLOAD_SESSION_NOT_ACTIVE` |
| provider/storage unavailable | `503` / `UPLOAD_STORAGE_UNAVAILABLE` |

Errors do not include provider text, bucket/key, upload ID, signed query, credential, or stack.

### Acceptance criteria

- [ ] All object operations obey the exact key classes and reject traversal/escape before storage.
- [ ] Exact MIME, size, part, ETag, and declared-size rules are enforced server-side.
- [ ] Multipart sessions are Mongo-owned, principal-bound, expiry-bounded, replay-safe, and safe
  across controller/process reload.
- [ ] Objects remain private; every listed REST/Socket.IO projection uses the locked 300-second
  delivery contract and no raw provider URL/public ACL assumption.
- [ ] Existing endpoint/event/success payload fields remain stable except the explicitly required
  public-demo init `fileSize` extension.
- [ ] Image-worker validates source ownership, writes only approved durable output, and deletes only
  current-attempt-owned staging/output objects.
- [ ] Upload remains disabled in every pre-D2 fixture; only the locked disabled-to-validated
  transition can represent later activation.
- [ ] Automated tests cover keys, exact limits, principal substitution, lifecycle/replay/reload,
  private projections, fault cleanup, worker races, activation mismatch, and error redaction.
- [ ] No credential, provider response, presigned URL, raw key, or signed query is retained in Git,
  logs, fixtures, or evidence.

### Retained risks and boundaries

Exact-origin S3 CORS, browser `PUT`, readable `ETag`, live Railway-to-S3 compatibility, and real
image-worker/provider behavior remain post-approval D2 evidence. No pre-D2 case may contact AWS.

### Blocked by

- #113
