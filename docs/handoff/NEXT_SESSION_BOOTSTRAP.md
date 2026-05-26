# Next Session Bootstrap: F-Final Auth Migration

## Migration Progress

| Step | Status | Commit |
|------|--------|--------|
| Step 1 — Memory-only access token | ✅ Done | feat(auth): memory-only access token — step 1 |
| Step 2 — Remove bootstrap fallback | ✅ Done | feat(auth): refresh-cookie-only bootstrap — step 2 |
| Step 3-preflight — Map user persistence | ✅ Done | (no commit — read-only analysis) |
| Step 4A — SocketProvider identity | ✅ Done | feat(auth): remove stored-user dependency from socket/call layer — step 4 |
| Step 4B — Call/badge consumers | ✅ Done | (same commit as 4A) |
| Step 4 lint fix — setState/useCallback | ✅ Done | |
| Step 3 — Memory-only user | ⏳ Next | |
| Step 5 — Full regression | ⬜ Pending | |
| Step 6 — Docs update | ⬜ Pending | |

## What Changed (accumulated)

### authSession.js
- getAccessToken() / setAccessToken() / clearAccessToken() — memory-only
- getStoredUser() / setStoredUser() — STILL localStorage (Step 3 sẽ xóa)

### authBootstrap.js
- Refresh-cookie-only bootstrap
- Removed: fallback branch (source: "local-storage-fallback")
- Removed: getAccessToken import

### SocketProvider.jsx
- Removed: getStoredUser() / setStoredUser() imports
- getSocketAuthState() dùng AuthProvider context (authUser)
- AVATAR_UPDATED: setCurrentUser(updatedUser) thay vì setStoredUser()
- Split thành 2 effects riêng: auth user sync + logout online-user clearing
  (fix React Compiler lint: setState sync in effect)

### useCallActions.js
- Removed: getStoredUser() — dùng useAuth() hook
- callUser wrapped trong useCallback (fix React Compiler lint: impure function)
- clearStoredCallState, leaveCall, makePeer stabilized thành useCallback

### useSocketEvents.js
- Removed: getStoredUser() — dùng useAuth() hook
- callerDbId lấy từ authUser thay vì stored user

### CallHistoryProvider.jsx
- Removed: getStoredUser() — dùng SocketProvider.currentUser

## Current Test Baseline
- client: all pass (full suite)
- 0 lint errors trong SocketProvider.jsx và useCallActions.js

## Do Not Change
- Non-auth localStorage keys: last_message_id, tempCallId, activePartnerUserId,
  callStartTime, tempCallerUserId, tempCallSignal, tempCallerId
- WebRTC signaling logic
- Socket event names
- Backend auth / Socket.IO backend auth unless a later step explicitly requires it
- Unrelated feature code or broad refactors

## Next Recommended Step

Use `/tdd` for Step 3 — Memory-only user.

Scope:
- client/src/services/auth/authSession.js
- client/src/services/auth/authSession.test.js
- Any direct tests that assert persisted user behavior

Goal:
- getStoredUser() reads memory only
- setStoredUser() writes memory only and removes legacy localStorage["user"]
- clearStoredUser() clears memory and removes legacy localStorage["user"]
- clearAuthSession() does not remove non-auth localStorage keys

Stop after Step 3 gate passes. Do not start Step 5 without explicit approval.
