# Next Session Bootstrap: F-Final Auth Migration

Use this file to bootstrap the next agent session for the `web-socket` repository.

## Current Completed Issue

Most recent completed issue: **frontend app-backend auth migration to shared `axiosClient`**.

Completed slices:

- Search, friends, groups, messages, profile JSON, file upload control-plane, single multipart upload, call-history REST, and profile avatar multipart now use shared `axiosClient`.
- Shared `axiosClient` provides Bearer injection plus refresh-once retry.
- Profile avatar multipart keeps existing compression, preview, queued-avatar behavior, and warning path.
- Group creation unread/realtime bug was previously fixed and regression-covered:
  - Creator refresh/realtime should show creation system message as read, no badge.
  - Invited members should see creation system message unread with badge `1`.

Current F-final gated migration status:

- **Step 1 approved and implemented:** access token is now memory-only in `authSession`.
- User persistence remains unchanged for now.
- Bootstrap fallback removal is intentionally deferred to Step 2.

## Current Bug / Issue In Progress

Active work in progress: **F-final auth migration — remove sensitive token/user persistence from `localStorage` safely**.

Current state:

- Step 1 changed access token behavior only.
- `bootstrapAuth` still contains the fallback branch, but it is effectively dead/no-op for persisted tokens because `getAccessToken()` no longer reads `localStorage["token"]`.
- Step 2 is next: remove the dead token bootstrap fallback explicitly and update bootstrap tests.

No known failing tests at the checkpoint.

## Files Changed In Current Working Tree

Current `git status --short` shows only Step 1 files changed:

- `client/src/services/auth/authSession.js`
  - `getAccessToken()` now returns memory token only.
  - `setAccessToken()` updates memory and removes any legacy `localStorage["token"]`.
  - `clearAccessToken()` still clears memory and removes legacy token.
  - User persistence remains unchanged.
- `client/src/services/auth/authSession.test.js`
  - Updated token assertions to memory-only semantics.
  - Kept stored-user localStorage tests unchanged.
  - Updated clear-session expectations to preserve Step 1 behavior: token is not persisted, user is still persisted/cleared.

Important: prior auth migration slices may already be in the working branch/history, but current unstaged diff at handoff time only shows these Step 1 files.

## Tests / Manual Tests Already Passed

Automated checks passed after Step 1:

```powershell
cd client
npm.cmd test -- src/services/auth/authSession.test.js
```

Result: client test command passed with `95/95` tests. Note: this repo's test script always runs the configured client suite and appended file arg.

```powershell
cd client
npm.cmd run build
```

Result: build passed.

Known build warning:

- Vite still warns that one chunk is larger than 500 kB. Existing/non-blocking.

Search/check performed:

```powershell
rg -n "ACCESS_TOKEN_KEY|localStorage\.getItem\(\"token\"\)|localStorage\.setItem\(\"token\"|getStorage\(\)\?\.getItem\(ACCESS_TOKEN_KEY\)|setItem\(ACCESS_TOKEN_KEY" client/src/services/auth client/src/features/auth client/src/services/api client/src/services/socket --glob '!**/*.test.js'
```

Result: no token localStorage read/write matches outside tests.

Manual tests not yet run after Step 1:

1. Login creates no `localStorage["token"]`.
2. Hard refresh with valid refresh cookie stays authenticated.
3. Expired access token + valid refresh cookie retries through `axiosClient`.
4. Expired/missing refresh cookie logs out.
5. User profile still exists in `localStorage["user"]` for now.

## Risks / Caveats

- Step 1 intentionally does **not** remove user persistence.
- Step 1 intentionally does **not** remove `bootstrapAuth` fallback code; that is Step 2.
- Since `getAccessToken()` is memory-only now, a hard refresh depends on refresh-cookie bootstrap even before Step 2.
- If refresh cookie config is broken in a manual environment, users may appear logged out after hard refresh.
- Cross-tab auth sync is not fully solved yet; removing token persistence weakens storage-event token sync, but active-tab `auth-changed` still exists.
- `SocketProvider` and call code still have stored-user fallback paths; do not remove user persistence until those are diagnosed/planned.
- Do not remove non-auth `localStorage` keys such as pending message queue, `last_message_id`, call temp state, or media state.
- Do not change backend auth or Socket.IO backend auth unless tests prove it is required.

## Exact Next Recommended Skill

Use **`tdd`** next.

Reason: Step 2 is a small implementation slice with clear tests: remove the dead token bootstrap fallback from `bootstrapAuth` and update `authBootstrap` tests.

If Step 2 produces unexpected failures, switch to **`diagnose`** immediately and stop broad implementation.

## Exact Next Prompt

```text
Use the tdd skill.

Implement F-final Step 2 only: remove token bootstrap fallback.

Context:
- Step 1 is complete: authSession access token is memory-only.
- getAccessToken() no longer reads localStorage["token"].
- User persistence remains unchanged and must not be touched.
- bootstrapAuth still contains the old fallback branch, but it is now dead/no-op for persisted tokens.

Scope:
- Modify only:
  - client/src/services/auth/authBootstrap.js
  - client/src/services/auth/authBootstrap.test.js
- Do not change authSession in this step.
- Do not remove user persistence.
- Do not touch SocketProvider, call contexts, backend auth, axiosClient, or non-auth localStorage keys.

Requirements:
- Remove the fallback branch that authenticates from tokenStore.getAccessToken() after refreshSession fails or returns no token.
- Remove source "local-storage-fallback" from bootstrap behavior.
- Refresh-cookie success should still:
  - setAccessToken(result.token)
  - setStoredUser(result.user) when present
  - return authenticated source "refresh-cookie"
- Refresh failure/no token should return unauthenticated source "none".
- Keep logoutAuth behavior unchanged.

Tests:
- Update authBootstrap tests:
  - keep refresh-cookie success test
  - replace local-token fallback test with: refresh unavailable returns unauthenticated even if tokenStore has a token/user
  - keep unauthenticated when refresh returns success false/no token
  - keep logout test
- Run:
  cd client && npm.cmd test -- src/services/auth/authBootstrap.test.js
  cd client && npm.cmd run build

Stop:
- Stop after Step 2 and report checkpoint in the required CAVEMAN CHECKPOINT format.
- Do not continue to Step 3 without explicit approval.
```

## Do Not Change Casually

- Do not remove user persistence yet.
- Do not clean SocketProvider/call stored-user fallback until a separate diagnose/plan step.
- Do not remove non-auth localStorage keys.
- Do not change backend auth or Socket.IO backend auth.
- Do not refactor unrelated features.
- Do not hide failures; diagnose them.
- Do not commit unless user explicitly asks.