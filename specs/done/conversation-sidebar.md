# Conversation Sidebar

## Why

Người dùng cần danh sách hội thoại gần đây, unread badges, và bạn bè chưa nhắn tin để điều hướng nhanh.

## Behavior

- Direct sidebar đọc recent conversations từ Redis ZSET `convs:{userId}` khi có cache.
- Redis miss hoặc Redis unavailable warm-up từ MongoDB `Message` và `User.friends`.
- Friends chưa có tin nhắn vẫn xuất hiện phía sau conversations có message.
- Last message preview được derive từ latest `Message`.
- Direct unread count derive từ `receiver + isRead=false`.
- Group sidebar đọc từ `Group.members` và aggregate latest/unread từ `Message`.
- Group unread count derive từ `readBy` legacy semantics.
- Sidebar hiện vẫn legacy-authoritative.

## Done When

- Direct sidebar trả về conversations theo thứ tự mới nhất trước.
- Friends chưa nhắn tin vẫn hiển thị với `lastMessage=null`.
- Last message preview đúng cho text, attachment, và call log.
- Unread badges đúng theo legacy semantics.
- Redis cache miss không làm sidebar trống sai.
- Chưa expose `Conversation._id` ra client.
