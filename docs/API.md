# REST API Reference

This document describes the current REST API surface for the `web-socket`
backend. It is intentionally concise and hand-written so it stays aligned with
the existing Express controllers.

Base URL in local backend development:

```text
http://localhost:3000
```

Base URL through Docker/nginx:

```text
http://localhost
```

## Cross-Cutting Behavior

### Request IDs

Every HTTP request gets an `x-request-id`.

- If the client sends `x-request-id`, the server preserves it.
- If the client omits it, the server generates one.
- The response includes the same `x-request-id`.
- Request logs include method, path, status, latency, requestId, and userId when
  authentication middleware has resolved a user.
- Queue jobs published from HTTP flows use this request ID as their RabbitMQ
  `correlationId`.

Example:

```bash
curl -i http://localhost:3000/healthz \
  -H "x-request-id: demo-request-1"
```

### Authentication

Local login returns an access JWT. Protected REST endpoints expect:

```http
Authorization: Bearer <token>
```

The access token is signed with `JWT_SECRET` and currently expires after `1d`. In the browser client, the access token and current user are kept in memory only and are not persisted to `localStorage`. Login, register, Google login, and refresh responses hydrate that memory session.

Login, register, Google login, and refresh also set an HttpOnly `kittachat_refresh` cookie. The frontend uses that refresh cookie for reload/session recovery: on startup, `AuthProvider` calls the refresh endpoint, then hydrates the returned access token and user into memory. REST requests still use `Authorization: Bearer <token>`; `axiosClient` reads the token from memory, refreshes once on `401`/`403`, and only clears auth state/redirects to `/login` if refresh fails.

Non-sensitive UI or temporary recovery state may still use `localStorage`, but sensitive auth data (`token`, `user`) should not be stored there.

Common auth errors:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Truy cập bị từ chối. Vui lòng đăng nhập!"
  },
  "message": "Truy cập bị từ chối. Vui lòng đăng nhập!",
  "requestId": "demo-request-1",
  "msg": "Truy cập bị từ chối. Vui lòng đăng nhập!"
}
```

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Token không hợp lệ hoặc đã hết hạn!"
  },
  "message": "Token không hợp lệ hoặc đã hết hạn!",
  "requestId": "demo-request-1",
  "msg": "Token không hợp lệ hoặc đã hết hạn!"
}
```
```

### Response Shapes

Auth/profile errors, message validation errors, not-found routes, and global
Express errors use this error shape:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email hoặc mật khẩu không đúng"
  },
  "message": "Email hoặc mật khẩu không đúng",
  "requestId": "demo-request-1"
}
```

The top-level `message` and selected legacy fields such as `msg` remain for
backward compatibility while newer clients can read `error.code`,
`error.message`, and `requestId`. Some older success responses still return raw
documents instead of a single success envelope.

## Health And Readiness

### `GET /healthz`

Auth: none.

Reports process and dependency health. RabbitMQ unavailable makes the service
`degraded`, not hard-down for chat API startup.

Success/degraded response:

```json
{
  "status": "healthy",
  "timestamp": "2026-05-21T15:00:00.000Z",
  "instance": {
    "name": "backend",
    "pid": 1234,
    "uptime": 42,
    "memory": {
      "rss": "95MB",
      "heapUsed": "28MB"
    }
  },
  "services": {
    "mongo": { "status": "connected" },
    "redis": { "status": "connected" },
    "rabbitmq": { "status": "connected" }
  }
}
```

Unhealthy response status is `503` when a required dependency is unavailable.

### `GET /readyz`

Auth: none.

Readiness checks required startup dependencies: MongoDB and Redis.

```json
{
  "status": "ready",
  "timestamp": "2026-05-21T15:00:00.000Z",
  "services": {
    "mongo": { "status": "connected" },
    "redis": { "status": "connected" },
    "rabbitmq": { "status": "unavailable", "error": "rabbit down" }
  }
}
```

### `GET /ops`

Auth: none.

Returns lightweight operational JSON for local debugging and interview-ready
observability. This is not a Prometheus endpoint and should not be treated as a
complete production monitoring system.

The payload intentionally avoids secrets, tokens, email addresses, user PII, and
raw connection strings. Dependency details are summarized as statuses only.

```json
{
  "status": "degraded",
  "timestamp": "2026-05-22T10:00:00.000Z",
  "uptime": 42,
  "memory": {
    "rssBytes": 99614720,
    "heapTotalBytes": 35651584,
    "heapUsedBytes": 29360128,
    "externalBytes": 1048576
  },
  "dependencies": {
    "mongo": { "status": "connected" },
    "redis": { "status": "connected" },
    "rabbitmq": { "status": "unavailable" }
  },
  "runtime": {
    "nodeEnv": "development",
    "nodeVersion": "v22.0.0",
    "activeSocketCount": 2
  },
  "monitoring": {
    "kind": "lightweight-ops",
    "prometheus": false
  }
}
```

`activeSocketCount` is `null` when Socket.IO has not been attached to the
Express app, such as in narrow tests or non-socket bootstraps.

## Auth

### App-Level Rate Limits

Nginx still provides the outer IP-based rate limiting for Docker/nginx traffic.
Express also applies lightweight in-process limits to sensitive auth routes so
local/dev and direct backend traffic get the same basic protection.

Current default Express limits:

- `POST /api/auth/login`: 10 attempts per 15 minutes per client IP.
- `POST /api/auth/register`: 5 attempts per hour per client IP.
- `POST /api/auth/forgot-password`: 5 attempts per hour per client IP.

Rate-limit responses use the standardized error envelope:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many login attempts. Please try again later."
  },
  "message": "Too many login attempts. Please try again later.",
  "requestId": "demo-request-1"
}
```
### `POST /api/auth/register`

Auth: none.

Request body:

```json
{
  "displayName": "Alice",
  "email": "alice@example.com",
  "password": "Password1!",
  "confirmPassword": "Password1!"
}
```

Success `201`:

```json
{
  "success": true,
  "message": "ÄÄƒng kÃ½ thÃ nh cÃ´ng",
  "user": {
    "_id": "665f1f...",
    "email": "alice@example.com",
    "displayName": "Alice",
    "avatar": "https://ui-avatars.com/api/?name=Alice&background=22c55e&color=fff&size=128",
    "provider": "local",
    "friends": [],
    "friendRequests": []
  }
}
```

Common errors:

- `400` missing fields
- `400` invalid email
- `400` weak password
- `400` duplicate email
- `429` too many registration attempts
- `500` server error

### `POST /api/auth/login`

Auth: none.

Request body:

```json
{
  "email": "alice@example.com",
  "password": "Password1!"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ÄÄƒng nháº­p thÃ nh cÃ´ng",
  "token": "<jwt>",
  "user": {
    "id": "665f1f...",
    "displayName": "Alice",
    "email": "alice@example.com",
    "avatar": "https://...",
    "status": "ChÃ o báº¡n, tÃ´i Ä‘ang dÃ¹ng KittaChat.",
    "activityStatus": {
      "state": "active",
      "lastSeen": "2026-05-21T15:00:00.000Z"
    }
  }
}
```

Common errors:

- `400` wrong email/password
- `400` account uses Google provider
- `429` too many login attempts
- `500` server error

Invalid credential example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email hoặc mật khẩu không đúng"
  },
  "message": "Email hoặc mật khẩu không đúng",
  "requestId": "demo-request-1"
}
```

### `POST /api/auth/google`

Auth: Firebase ID token in request body.

Request body:

```json
{
  "idToken": "<firebase-id-token>"
}
```

Success `200` returns an app JWT and user profile. Google avatar processing may
be queued through RabbitMQ as a background side effect.

Common errors:

- `400` email already registered with local password
- `401` invalid Firebase token
- `500` server error


Successful `register`, `login`, and `google` responses also include a `Set-Cookie` header for `kittachat_refresh`:

```http
Set-Cookie: kittachat_refresh=<refresh-jwt>; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=604800
```

The cookie is intentionally not readable by JavaScript. In production it is marked `Secure` unless `AUTH_COOKIE_SECURE=false` is explicitly configured for controlled non-HTTPS testing.

### `GET /api/auth/session`

Auth: valid `kittachat_refresh` cookie.

Returns current session state without requiring a Bearer access token. This endpoint is a migration foundation for future app startup auth bootstrap; the current frontend does not rely on it yet.

Success `200`:

```json
{
  "success": true,
  "authenticated": true,
  "user": {
    "id": "665f1f...",
    "_id": "665f1f...",
    "displayName": "Alice",
    "email": "alice@example.com",
    "avatar": "https://...",
    "status": "Chào bạn, tôi đang dùng KittaChat.",
    "activityStatus": {
      "state": "active",
      "lastSeen": "2026-05-21T15:00:00.000Z"
    }
  }
}
```

Missing cookie returns standardized `401 SESSION_REQUIRED`. Invalid or expired cookie returns standardized `401 INVALID_SESSION`.

### `POST /api/auth/refresh`

Auth: valid `kittachat_refresh` cookie.

Issues a new access token, current user payload, and refresh cookie. The frontend uses this endpoint for reload/session recovery and for the refresh-once retry path in `axiosClient`; the returned token/user hydrate memory-only auth state.

Success `200`:

```json
{
  "success": true,
  "token": "<new-jwt>",
  "user": {
    "id": "665f1f...",
    "_id": "665f1f...",
    "displayName": "Alice",
    "email": "alice@example.com",
    "avatar": "https://...",
    "status": "Chào bạn, tôi đang dùng KittaChat.",
    "activityStatus": {
      "state": "active",
      "lastSeen": "2026-05-21T15:00:00.000Z"
    }
  }
}
```

### `POST /api/auth/logout`

Auth: none required.

Clears the refresh cookie. Current frontend logout also clears memory-only auth state and removes any legacy auth `localStorage` keys without removing unrelated UI/temp keys.

Success `200`:

```json
{
  "success": true,
  "message": "Đăng xuất thành công"
}
```

### `POST /api/auth/forgot-password`

Auth: none.

Request body:

```json
{
  "email": "alice@example.com"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Náº¿u email tá»“n táº¡i, chÃºng tÃ´i Ä‘Ã£ gá»­i hÆ°á»›ng dáº«n"
}
```

The endpoint intentionally returns a generic success-style message even when the
email does not exist. Password reset email sending is queued through RabbitMQ.

Common errors:

- `429` too many password reset email attempts
- `500` server error

### `POST /api/auth/reset-password/:id/:token`

Auth: reset token in URL.

Request body:

```json
{
  "password": "NewPassword1!",
  "confirmPassword": "NewPassword1!"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng"
}
```

Common errors:

- `400` password validation failure
- `400` password confirmation mismatch
- `401` invalid/expired reset token
- `500` server error

## Users And Profile

All endpoints in this section require `Authorization: Bearer <token>` unless
noted otherwise.

### `GET /api/users/profile`

Returns the authenticated user's profile.

Success `200`:

```json
{
  "success": true,
  "user": {
    "_id": "665f1f...",
    "email": "alice@example.com",
    "displayName": "Alice",
    "avatar": "https://...",
    "status": "Available",
    "activityStatus": {
      "state": "active",
      "lastSeen": "2026-05-21T15:00:00.000Z"
    }
  }
}
```

Common errors:

- `401` missing token
- `403` invalid token
- `404` user not found
- `500` server error

### `PUT /api/users/profile`

Content type: `multipart/form-data`.

Fields:

- `displayName` optional string
- `status` optional string
- `activityStatus` optional JSON string
- `avatar` optional image file

Success `200`:

```json
{
  "success": true,
  "message": "Cáº­p nháº­t thÃ nh cÃ´ng",
  "queued": true,
  "avatarRequestId": "9f2e...",
  "avatarQueueError": null,
  "user": {
    "_id": "665f1f...",
    "displayName": "Alice Updated",
    "status": "Available"
  }
}
```

Avatar processing is asynchronous. If RabbitMQ is unavailable, the profile
update can still succeed with `queued: false` and a safe `avatarQueueError`.

Common errors:

- `400` avatar is not an image
- `401` missing token
- `403` invalid token
- `500` server error

### `GET /api/users`

Returns users other than the authenticated user, with sidebar/read metadata.

Success `200`:

```json
{
  "success": true,
  "users": [
    {
      "_id": "665f20...",
      "displayName": "Bob",
      "avatar": "https://...",
      "isRead": true,
      "lastMessage": null
    }
  ]
}
```

### `GET /api/users/:id`

Returns another user's public profile plus relationship flags.

Success `200`:

```json
{
  "success": true,
  "user": {
    "_id": "665f20...",
    "displayName": "Bob",
    "avatar": "https://...",
    "isFriend": true,
    "isSent": false,
    "isReceived": false
  }
}
```

Common errors:

- `404` user not found
- `500` server error

### `GET /api/users/search?search=<term>`

Searches users by display name/email-like fields used by the implementation.

Success `200`:

```json
{
  "success": true,
  "users": [
    {
      "_id": "665f20...",
      "displayName": "Bob",
      "avatar": "https://...",
      "isFriend": false,
      "isSent": false,
      "isReceived": false,
      "activityStatus": { "state": "active" }
    }
  ]
}
```

### Friends And Sidebar

#### `GET /api/users/friends`

```json
{
  "success": true,
  "friends": [
    {
      "_id": "665f20...",
      "displayName": "Bob",
      "avatar": "https://..."
    }
  ]
}
```

#### `GET /api/users/friend-requests`

```json
{
  "success": true,
  "requests": [
    {
      "_id": "665f20...",
      "displayName": "Bob",
      "avatar": "https://..."
    }
  ]
}
```

#### `GET /api/users/sidebar-list`

Returns recent sidebar users/conversations enriched with last-message and
presence data.

```json
{
  "success": true,
  "users": [
    {
      "_id": "665f20...",
      "displayName": "Bob",
      "lastMessage": {
        "content": "Hello",
        "messageId": "6660..."
      },
      "isOnline": true
    }
  ]
}
```

#### `GET /api/users/online-friends`

```json
{
  "success": true,
  "onlineUsers": [
    {
      "userId": "665f20...",
      "status": "online",
      "lastSeen": "2026-05-21T15:00:00.000Z"
    }
  ]
}
```

#### `POST /api/users/friend-request`

Request body:

```json
{
  "receiverId": "665f20..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ÄÃ£ gá»­i lá»i má»i"
}
```

#### `POST /api/users/accept-friend`

Request body:

```json
{
  "senderId": "665f20..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ÄÃ£ cháº¥p nháº­n lá»i má»i káº¿t báº¡n."
}
```

#### `POST /api/users/reject-friend`

Request body:

```json
{
  "senderId": "665f20..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ÄÃ£ tá»« chá»‘i lá»i má»i"
}
```

#### `POST /api/users/remove-friend`

Request body:

```json
{
  "friendId": "665f20..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ÄÃ£ há»§y káº¿t báº¡n",
  "friendId": "665f20...",
  "hadMessages": true
}
```

## Messages

### `POST /api/messages`

Auth: currently not enforced by this route. In normal app flow, realtime message
send uses Socket.IO with JWT-authenticated sockets; this REST route is legacy
support for creating messages.

Request body for direct message:

```json
{
  "sender": "665f1f...",
  "receiver": "665f20...",
  "text": "Hello Bob",
  "attachments": [],
  "isGroup": false
}
```

Success `200` returns the saved message document:

```json
{
  "_id": "6660...",
  "conversationId": "665f1f..._665f20...",
  "type": "text",
  "sender": "665f1f...",
  "receiver": "665f20...",
  "text": "Hello Bob",
  "attachments": [],
  "createdAt": "2026-05-21T15:00:00.000Z"
}
```

Common errors:

- `400` missing sender/receiver for direct message
- `500` server error

Missing direct-message participant example:

```json
{
  "success": false,
  "error": {
    "code": "MESSAGE_RECIPIENT_REQUIRED",
    "message": "Thiếu thông tin người gửi/nhận"
  },
  "message": "Thiếu thông tin người gửi/nhận",
  "requestId": "demo-request-1"
}
```

### `GET /api/messages/:userId1/:userId2`

Auth: currently not enforced by this route.

Query params:

- `isGroup=true` when `userId2` is a group id
- `cursor=<messageId>` optional pagination cursor
- `limit=<number>` optional, defaults to `20`

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "_id": "6660...",
      "conversationId": "665f1f..._665f20...",
      "sender": {
        "_id": "665f1f...",
        "displayName": "Alice",
        "avatar": "https://..."
      },
      "receiver": "665f20...",
      "text": "Hello Bob",
      "type": "text",
      "attachments": []
    }
  ],
  "hasMore": false
}
```

### `GET /api/messages/sync`

Auth: required.

Query params:

- `after_id=<messageId>` optional
- `limit=<number>` optional, capped at `200`

Used by the client after reconnect to recover missed messages from MongoDB.

Success `200`:

```json
{
  "success": true,
  "messages": [
    {
      "_id": "6660...",
      "conversationId": "665f1f..._665f20...",
      "text": "Missed while offline"
    }
  ],
  "count": 1
}
```

## Groups

All group mutation/list endpoints require auth except `GET /api/groups/:groupId`
in the current route file.

### `POST /api/groups`

Auth: required.

Request body:

```json
{
  "name": "Study Group",
  "members": ["665f20...", "665f21..."]
}
```

The authenticated user becomes admin and is included as a member. The current
implementation requires at least 3 total members including the admin.

Success `200`:

```json
{
  "success": true,
  "group": {
    "_id": "6661...",
    "name": "Study Group",
    "admin": {
      "_id": "665f1f...",
      "displayName": "Alice"
    },
    "members": [
      { "_id": "665f1f...", "displayName": "Alice" },
      { "_id": "665f20...", "displayName": "Bob" }
    ],
    "avatar": "https://ui-avatars.com/api/?name=Study%20Group&background=random&color=fff&size=128"
  }
}
```

Common errors:

- `400` fewer than 3 total members
- `401`/`403` auth errors
- `500` server error

### `GET /api/groups`

Auth: required.

Returns groups where the authenticated user is a member, with sidebar-like
last-message/read state.

```json
{
  "success": true,
  "groups": [
    {
      "_id": "6661...",
      "name": "Study Group",
      "members": [],
      "lastMessage": {
        "content": "Welcome",
        "messageId": "6662..."
      }
    }
  ]
}
```

### `GET /api/groups/:groupId`

Auth: currently not enforced by the route.

Success `200` returns the group document.

Common errors:

- `404` group not found
- `500` server error

### `POST /api/groups/:groupId/add-member`

Auth: required; current user must be group admin.

Request body:

```json
{
  "userId": "665f22..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "ThÃªm thÃ nh viÃªn thÃ nh cÃ´ng",
  "group": {
    "_id": "6661...",
    "name": "Study Group"
  }
}
```

Common errors:

- `404` group not found
- `403` not admin
- `400` user already in group
- `500` server error

### `POST /api/groups/:groupId/remove-member`

Auth: required; current user must be group admin.

Request body:

```json
{
  "userId": "665f22..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "XÃ³a thÃ nh viÃªn thÃ nh cÃ´ng"
}
```

### `POST /api/groups/:groupId/transfer-admin`

Auth: required; current user must be group admin.

Request body:

```json
{
  "newAdminId": "665f20..."
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Chuyá»ƒn quyá»n admin thÃ nh cÃ´ng",
  "group": {
    "_id": "6661...",
    "admin": "665f20..."
  }
}
```

### `PUT /api/groups/:groupId/rename`

Auth: required; current user must be group admin.

Request body:

```json
{
  "name": "New Group Name"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Äá»•i tÃªn nhÃ³m thÃ nh cÃ´ng",
  "group": {
    "_id": "6661...",
    "name": "New Group Name"
  }
}
```

### `DELETE /api/groups/:groupId`

Auth: required; current user must be group admin.

Success `200`:

```json
{
  "success": true,
  "message": "Giáº£i tÃ¡n nhÃ³m thÃ nh cÃ´ng"
}
```

## Files And Uploads

All file endpoints require auth.

### `POST /api/files/init`

Starts a multipart upload.

Request body:

```json
{
  "fileName": "video.mp4",
  "fileType": "video/mp4"
}
```

Success `200`:

```json
{
  "uploadId": "multipart-upload-id",
  "key": "uploads/video.mp4"
}
```

### `POST /api/files/get-presigned-url`

Request body:

```json
{
  "uploadId": "multipart-upload-id",
  "key": "uploads/video.mp4",
  "partNumber": 1
}
```

Success `200`:

```json
{
  "url": "https://s3-presigned-url"
}
```

### `POST /api/files/complete`

Completes multipart upload and stores file metadata in MongoDB.

Request body:

```json
{
  "uploadId": "multipart-upload-id",
  "key": "uploads/video.mp4",
  "parts": [
    { "ETag": "\"etag-1\"", "PartNumber": 1 }
  ],
  "fileName": "video.mp4",
  "fileType": "video/mp4",
  "fileSize": 1048576,
  "fileHash": "sha256-or-client-hash"
}
```

Success `200`:

```json
{
  "message": "Upload thÃ nh cÃ´ng",
  "file": {
    "_id": "6663...",
    "ownerId": "665f1f...",
    "originalName": "video.mp4",
    "mimeType": "video/mp4",
    "size": 1048576,
    "s3Key": "uploads/video.mp4",
    "url": "https://..."
  }
}
```

### `POST /api/files/upload-single`

Content type: `multipart/form-data`.

Fields:

- `file`: image file, max 50MB

This endpoint stages the image source and queues RabbitMQ image processing. The
final processed file is delivered asynchronously through Socket.IO events such
as `fileProcessed`.

Success `202`:

```json
{
  "success": true,
  "queued": true,
  "requestId": "9f2e...",
  "message": "Anh dang duoc xu ly.",
  "file": {
    "requestId": "9f2e...",
    "status": "processing",
    "name": "cat.png",
    "type": "image/png",
    "size": 12345
  }
}
```

Common errors:

- `400` no file uploaded
- `400` file is not an image
- `413` file larger than multer limit
- `503` queue unavailable after staging cleanup

## Calls

REST call endpoints expose call-history state. Realtime call signaling itself
uses Socket.IO events, not REST.

All call endpoints require auth.

### `GET /api/calls/history`

Query params:

- `limit=<number>` optional
- `page=<number>` optional

Success `200`:

```json
{
  "success": true,
  "calls": [
    {
      "_id": "6664...",
      "callerId": {
        "_id": "665f1f...",
        "displayName": "Alice",
        "avatar": "https://..."
      },
      "receiverId": {
        "_id": "665f20...",
        "displayName": "Bob",
        "avatar": "https://..."
      },
      "type": "video",
      "status": "completed",
      "duration": 42,
      "createdAt": "2026-05-21T15:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### `GET /api/calls/missed`

Returns missed/rejected/unreachable/busy calls that are unread by the current
user.

Success `200`:

```json
{
  "success": true,
  "count": 1,
  "calls": [
    {
      "_id": "6664...",
      "type": "audio",
      "status": "missed",
      "callerId": {
        "_id": "665f20...",
        "displayName": "Bob"
      }
    }
  ]
}
```

### `POST /api/calls/:id/read`

Marks one accessible call record as read.

Success `200`:

```json
{
  "success": true,
  "message": "Call marked as read"
}
```

Common errors:

- `404` call not found or access denied
- `500` server error

### `POST /api/calls/read-all`

Marks all unread missed/rejected/unreachable/busy calls for the current user as
read.

Success `200`:

```json
{
  "success": true,
  "message": "3 calls marked as read",
  "modifiedCount": 3
}
```

## Local Verification Examples

Register and login:

```bash
curl -s http://localhost:3000/api/auth/register \
  -H "content-type: application/json" \
  -H "x-request-id: docs-register-1" \
  -d '{"displayName":"Alice","email":"alice@example.com","password":"Password1!","confirmPassword":"Password1!"}'

curl -s http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -H "x-request-id: docs-login-1" \
  -d '{"email":"alice@example.com","password":"Password1!"}'
```

Call protected profile after assigning the token:

The curl examples manually copy the token from the login/refresh response to demonstrate the HTTP contract. The browser client keeps that access token in memory and uses the HttpOnly refresh cookie after reload; it does not persist the token/user in `localStorage`.

```bash
TOKEN="<jwt-from-login>"

curl -s http://localhost:3000/api/users/profile \
  -H "authorization: Bearer $TOKEN" \
  -H "x-request-id: docs-profile-1"
```

Check health:

```bash
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/readyz
curl -s http://localhost:3000/ops
```

## Honest Limitations

- This is a hand-written API reference, not generated OpenAPI.
- Some legacy REST message/group routes do not enforce auth in the route file;
  the primary application flow uses authenticated Socket.IO for realtime chat.
- Some legacy controller errors outside auth/profile/messages still need the
  standardized error helper.
- File upload examples assume S3-compatible environment variables are configured.
- Realtime call setup/answer/reject/end flows are Socket.IO events and are
  intentionally documented outside this REST API reference.
