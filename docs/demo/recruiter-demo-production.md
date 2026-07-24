# KittaChat Recruiter Demo Production Guide

This guide turns the approved recruiter-demo storyboard into a repeatable recording, narration and publishing workflow. The final video itself stays outside Git; only the production script and caption source are versioned.

## Target Output

- **Length:** approximately 2 minutes 30 seconds.
- **Format:** 16:9, 1080p, 30 fps, H.264 video with AAC audio.
- **Delivery:** Google Drive, shared as `Anyone with the link — Viewer`.
- **UI language:** use the existing Vietnamese UI; do not create a temporary translation build.
- **Narration:** English AI voice using the exact engineering terminology below.
- **Captions:** English captions burned into the video or uploaded as a caption track; the condensed caption source is [`recruiter-demo-captions.srt`](recruiter-demo-captions.srt).

## Recording Preflight

1. Check out the exact commit that will be named in the README.
2. Start the Docker Compose source-of-truth flow and run `npm run seed:demo`.
3. Use two clean browser profiles or isolated browser contexts for Alice and Bob.
4. Set both browser windows to the same zoom level and hide personal bookmarks, extensions and profile chrome.
5. Enable operating-system Do Not Disturb and close unrelated applications.
6. Use neutral demo messages and the seeded `Backend Team` group.
7. Use fake media or keep cameras disabled during the WebRTC chapter.
8. Record product footage only. Do not capture terminals, DevTools, RabbitMQ UI or provider dashboards.

## Shot List and On-Screen Callouts

| Time | Product footage | English callout |
| --- | --- | --- |
| `0:00–0:10` | Logo, tagline and two clean login/demo sessions. | `Full-Stack Realtime Communication` |
| `0:10–0:35` | Alice sends Bob a direct message; show immediate optimistic rendering and delivery in Bob's window. | `Optimistic UI + Retry-Safe Persistence` |
| `0:35–1:00` | Keep Alice in another conversation; Sam sends a message; show unread increment, reorder, filter chips and infinite scroll. | `Realtime Conversation Reordering` |
| `1:00–1:20` | Send a message in `Backend Team`; keep Bob's sender identity visible and show the update in another member's window. | `Cross-Replica Realtime Delivery` |
| `1:20–1:50` | Open Conversation Information Panel; show metadata, members, Media/Files/Links, one View All explorer, infinite scroll, Freshness Banner and Media Lightbox. | `Shared Resource Explorers with Cursor Pagination` |
| `1:50–2:10` | Alice starts a call, Bob accepts, toggle media, then end the call. | `WebRTC Peer-to-Peer Media · Socket.IO Signaling` |
| `2:10–2:30` | Show architecture SVG, five Engineering Highlights, Tests/Build badges and source/documentation links. | `Production-Oriented Distributed Backend Design` |

## English Narration Script

### `0:00–0:10` — Product Introduction

KittaChat is a full-stack realtime platform for direct messages, group collaboration, file sharing, presence, and peer-to-peer calls. This walkthrough starts with the product experience.

### `0:10–0:35` — Direct Messaging

In direct chat, Alice sends a message and sees it immediately through optimistic UI. The client preserves a generated idempotency key across retries, while MongoDB safely upserts by sender and key. Bob receives the persisted message in realtime, even when his socket is attached to a different backend replica. The result is responsive delivery without marketing the system as exactly once.

### `0:35–1:00` — Realtime Sidebar

The conversation sidebar reacts to incoming activity without a refresh. Sam's background message increments unread state and moves the conversation upward. Filter-specific cursor pagination keeps direct and group views independent, while infinite scroll loads older conversations without losing the active selection. Backend batch enrichment avoids a per-conversation lookup pattern as the unified list grows.

### `1:00–1:20` — Group Collaboration

Group collaboration preserves sender identity across every member's view. In Backend Team, Bob's message appears with the correct author and updates connected members through Socket.IO. Behind nginx, the Redis Adapter carries room events across three Express replicas, so realtime delivery is not limited to users connected to the same process.

### `1:20–1:50` — Conversation Information Panel

The Conversation Information Panel brings shared context into one place: metadata, members, media, files, and links. Each View All explorer owns its cursor and infinite-scroll state. Freshness banners announce newly available resources without disrupting the current snapshot, and the media lightbox keeps focused browsing separate from the underlying conversation. This turns the panel into a practical shared-resource workspace rather than a simple settings drawer.

### `1:50–2:10` — WebRTC Call

Calls use Socket.IO only for signaling. After Bob accepts, WebRTC carries audio and video directly between the peers. Media controls update during the call, and the main termination paths share a MongoDB-gated finalizer to prevent duplicate or conflicting terminal call history when timeout, disconnect, reject, and explicit end events race.

### `2:10–2:30` — Engineering Closing

Under the hood, KittaChat combines three Socket.IO replicas, Redis, RabbitMQ workers, and MongoDB. The engineering story centers on cross-replica delivery, retry-safe persistence, gated call finalization, a scalable conversation sidebar, and resilient background jobs. Tests, builds, source code, architecture decisions, and design documents are linked from the repository.

## Editing Checklist

- Keep product interactions readable at normal playback speed; use cuts instead of speeding up critical transitions.
- Use short callouts with a solid or translucent background and safe margins from browser edges.
- Keep captions to one or two lines and avoid covering the sidebar, message composer, panel resources or call controls.
- Normalize narration volume consistently and keep UI sounds below the voice track.
- Do not use background music if it reduces narration or caption clarity.
- Remove dead time, loading delays, permission prompts and failed attempts rather than hiding them with misleading footage.
- Export one final review file, watch it once with audio and once muted, then inspect it frame-by-frame for private data.

## Google Drive Publishing Checklist

1. Upload the final encoded video, not the editing project or raw recording.
2. Set General access to `Anyone with the link` and Role to `Viewer`.
3. Copy the share URL and open it in a separate anonymous/incognito browser session.
4. Confirm the video loads, starts, seeks and remains view-only without requesting access.
5. Record the final duration, recording date and demonstrated commit SHA.
6. Only after anonymous verification, replace the README preparation notice with the real thumbnail/CTA and metadata.

## README Handoff Values

Fill these values after the final export and anonymous Drive verification:

```text
Google Drive URL: <verified viewer URL>
Duration: <mm:ss>
Recorded: <YYYY-MM-DD>
Demonstrated commit: <full or traceable short SHA>
```
