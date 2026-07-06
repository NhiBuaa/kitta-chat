# Group Messaging

## Why

Người dùng cần trò chuyện theo nhóm, quản lý thành viên, và nhận realtime updates trong group.

## Behavior

- Tạo group với tên và danh sách thành viên.
- Group có admin và members.
- Group conversation id là group `_id` trong legacy message flow.
- Gửi group messages tới thành viên group.
- Thêm thành viên vào group.
- Xóa thành viên khỏi group.
- Chuyển admin group.
- Đổi tên group.
- Xóa group theo rule hiện có.
- Group system messages được tạo cho một số hành động lifecycle.
- Group sidebar hiển thị last message và unread count dựa trên legacy `Message`/`readBy`.

## Done When

- Group tạo thành công với members hợp lệ.
- Thành viên group nhận được update/message phù hợp.
- Add/remove/rename/transfer admin cập nhật MongoDB đúng.
- Group sidebar phản ánh last message và unread state.
- User ngoài group không được coi là participant hợp lệ.
- Legacy group conversation id vẫn là group `_id`.
