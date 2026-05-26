# F-Final Migration — Completed

## Final Auth Architecture

Authentication now uses a refresh-cookie bootstrap plus memory-only client session state. The browser keeps the refresh cookie via the backend, while the frontend stores the access token and current user only in module memory.

On app startup, `AuthProvider` starts in `checking`, then calls `bootstrapAuth()` through `/refresh`. A successful refresh response hydrates the memory access token and memory user, and `AuthProvider` exposes that state through `AuthContext`. Login and refresh-on-401 also hydrate the same memory session and dispatch the shared `auth-changed` event so dependent providers can sync.

Logout clears the backend session when possible, then clears only auth memory plus legacy auth localStorage keys. Page refresh relies on the refresh cookie/session response to restore identity; it does not read `localStorage["token"]` or `localStorage["user"]`.

## What Changed (per file)

- `client/src/services/auth/authSession.js`
  - Access token and user are memory-only (`memoryAccessToken`, `memoryUser`).
  - `setAccessToken()`, `clearAccessToken()`, `setStoredUser()`, and `clearStoredUser()` remove legacy `localStorage["token"]` / `localStorage["user"]` without writing auth data back.

- `client/src/services/auth/authBootstrap.js`
  - Bootstrap is refresh-cookie-only and no longer uses persisted token fallback.
  - Successful refresh stores token/user through the injected token store; failures return unauthenticated state.

- `client/src/services/auth/AuthContext.js`
  - Owns the shared `AuthContext` so `AuthProvider.jsx` only exports a component for Fast Refresh compatibility.

- `client/src/services/auth/useAuth.js`
  - Owns the `useAuth()` hook and preserves the existing provider guard error.

- `client/src/services/auth/AuthProvider.jsx`
  - Provides auth state from refresh/login/logout memory session only.
  - Initial user is `null`; user hydration comes from refresh/session response or explicit memory updates, not localStorage.
  - Exposes `refreshAuth`, `updateUser`, and `logout`; listens to `auth-changed` for memory-session sync.

- `client/src/services/api/axiosClient.js`
  - Injects the current memory access token into requests.
  - On 401/403, refreshes once, updates memory token/user, dispatches `auth-changed`, and retries the original request.
  - On refresh failure, clears auth session and redirects to `/login`.

- `client/src/features/auth/pages/Login.jsx`
  - Login success stores token/user through memory auth helpers and dispatches `auth-changed`.
  - Does not write `localStorage["user"]` or `localStorage["token"]`.

- `client/src/features/profile/components/UserProfileSidebar.jsx`
  - Profile/avatar updates call `AuthProvider`'s `updateUser()` instead of writing stored user data.
  - Local UI update callback behavior remains unchanged.

- `client/src/services/socket/SocketProvider.jsx`
  - Socket auth identity comes from `useAuth()` context via `getSocketAuthState()`.
  - Avatar update events update in-memory socket current user and dispatch UI events; no stored-user writes.
  - Keeps non-auth `last_message_id` localStorage behavior for missed-message recovery.

- `client/src/features/calls/context/useCallActions.js`
  - Reads caller identity from `useAuth()` instead of stored user fallback.
  - Stabilized call helpers with callbacks during the migration.

- `client/src/features/calls/context/useSocketEvents.js`
  - Reads call user identity from `useAuth()` instead of stored user fallback.

- `client/src/features/calls/context/CallHistoryProvider.jsx`
  - Uses `SocketProvider.currentUser` for current user identity instead of `getStoredUser()`.

## localStorage Policy (final state)

- Auth keys are no longer used as persistence:
  - `localStorage["token"]` is never read and is removed when token helpers run.
  - `localStorage["user"]` is never read and is removed when user helpers run.

- Non-auth localStorage keys remain allowed and should not be removed by auth cleanup:
  - `last_message_id`
  - `tempCallId`
  - `activePartnerUserId`
  - `callStartTime`
  - `tempCallerUserId`
  - `tempCallSignal`
  - `tempCallerId`
  - Other call/message recovery keys unrelated to auth persistence.

## Do Not Change

- Do not reintroduce `localStorage["token"]` or `localStorage["user"]` reads/writes.
- Do not replace refresh-cookie bootstrap with client-side persisted token fallback.
- Do not remove non-auth localStorage keys used by chat/call recovery.
- Do not change backend auth/session endpoints or Socket.IO backend auth for this migration.
- Do not change WebRTC signaling behavior or socket event names.
- Do not merge `useAuth()` back into `AuthProvider.jsx`; Fast Refresh requires the provider file to export only components.
- Do not broadly refactor unrelated chat, friend, group, call, or upload flows.

## Test Baseline

- `npm.cmd test` in `client`: 101 tests passed, 0 failed.
- Targeted lint after Fast Refresh split:
  - `npx.cmd eslint src/services/auth/AuthProvider.jsx`: 0 errors.
  - `npx.cmd eslint src/services/auth/useAuth.js`: 0 errors.
  - `npx.cmd eslint src/services/auth/AuthContext.js`: 0 errors.
- `npm.cmd run build` in `client`: passed.
- Full `npm.cmd run lint` is still expected to report unrelated existing project/cache lint issues unless `.vite-cache` is excluded.
