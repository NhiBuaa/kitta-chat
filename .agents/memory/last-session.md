# Handoff — Recruiter-Facing README

## Next Focus

Continue Slice 5 / GitHub Issue #12: publish the narrated Google Drive demo and finalize the recruiter-facing README.

## Current State

- Repository: `D:\Developer\Projects\shotter\shot-chat`
- Branch: `minor-bug-fixes`
- Draft PR: `https://github.com/NhiBuaa/kitta-chat/pull/13`
- Latest pushed commit: `3151c108 docs: improve product tour mobile layout`
- Source PRD: `specs/active/recruiter-facing-readme.md`
- Next-session plan: `.agents/next-session.md`

## Completed This Session

- Published the Visual Product Tour with exact assets under `docs/assets/readme/`:
  - `direct-chat.webp`
  - `group-chat.webp`
  - `conversation-panel.webp`
  - `video-call.webp`
  - `realtime-sidebar.gif`
- Verified the GIF shows an actual incoming message, unread increment and conversation reorder.
- Verified a connected WebRTC call using two isolated demo identities with both cameras disabled.
- Replaced Product Tour placeholders with real assets, English alt text and value-oriented captions.
- Revised the Direct/Group layout after GitHub mobile review so both render full-width instead of cramped table columns.

## Verification Evidence

- Asset audit: correct WebP/GIF MIME; no EXIF; GIF `460x900`, `5.91s`, `2.13 MB`.
- Local tests: Server `321/321`, Client `232/232`, production build passed.
- GitHub render: desktop and `390px` mobile viewport passed without horizontal overflow.
- GitHub Actions on commit `3151c108`: Server Tests, Client Tests and Client Build all succeeded.
- Manual acceptance: `.agents/manual-tests/recruiter-facing-readme/slice-4-visual-product-tour.md` is `PASSED`.

## Remaining Work

1. Developer records the approved 2–3 minute product-first walkthrough.
2. Add English AI narration and English captions/callouts.
3. Upload to Google Drive with viewer-only `Anyone with the link` access.
4. Verify the link in an anonymous/incognito session.
5. Replace the `Watch the Demo` preparation copy with the real CTA, duration, recording date and demonstrated commit.
6. Run the final recruiter 60-second audit, tests/build, link/secret scan and GitHub rendering checks.
7. Update Issue #12 and PR #13 when acceptance passes.

## Guardrails

- Do not add an unverified Google Drive URL.
- Do not commit video/raw captures, secrets, credentials or personal data.
- Do not claim a live deployment.
- Keep Docker Compose as the source of truth.
- Keep the approved five Engineering Highlights and recruiter-level architecture unchanged unless evidence requires a correction.

## Suggested Skills

- `browser:control-in-app-browser` — verify Google Drive anonymous viewing and final GitHub rendering.
- `test-craft` — create the Slice 5 manual acceptance guide.
- `handoff` — compact the next session when finalization is complete.
