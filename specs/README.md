# Specs

Giai đoạn 4 — Specs dùng để định nghĩa hành vi mong đợi của một feature cụ thể.

Chỉ tạo spec khi có feature cụ thể. Không tạo trước.

## Trạng thái

```text
specs/
├── active/
│   └── <feature-dang-lam>.md
└── done/
    └── <feature-da-hoan-thanh>.md
```

## Quy tắc

- `active/`: spec của feature đang được thiết kế/triển khai/migration.
- `done/`: spec của feature đã hoàn thành và chỉ dùng làm tham chiếu hành vi hiện có.
- Khi bắt đầu feature mới, tạo spec trong `active/` trước khi code.
- Khi feature hoàn thành, chuyển spec từ `active/` sang `done/`.
- Không để spec đã xong nằm chung mãi với spec đang làm.
- Không implement lại feature chỉ vì thấy spec trong `done/`.

## Ai sở hữu

Dev viết tay trước khi code, có thể nhờ AI nháp.

## Format

```md
# Feature Name

## Why

Người dùng cần ...

## Behavior

- Hành vi 1
- Hành vi 2
- Hành vi 3

## Done When

- Điều kiện hoàn thành 1
- Điều kiện hoàn thành 2
- Điều kiện hoàn thành 3
```

## Active Specs

- [Conversation Read Model Migration](./active/conversation-read-model-migration.md)

## Done Specs

- [Authentication](./done/authentication.md)
- [User Profile](./done/user-profile.md)
- [Friendships](./done/friendships.md)
- [User Search](./done/user-search.md)
- [Direct Messaging](./done/direct-messaging.md)
- [Group Messaging](./done/group-messaging.md)
- [Conversation Sidebar](./done/conversation-sidebar.md)
- [Presence](./done/presence.md)
- [Typing Indicators](./done/typing-indicators.md)
- [File And Avatar Uploads](./done/file-and-avatar-uploads.md)
- [Audio And Video Calls](./done/audio-video-calls.md)
- [Call History](./done/call-history.md)
- [Notifications And Email Jobs](./done/notifications-and-email-jobs.md)
- [Background Workers](./done/background-workers.md)
- [Operational Health](./done/operational-health.md)
