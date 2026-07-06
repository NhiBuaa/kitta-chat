# Presence

## Why

Người dùng cần biết bạn bè/người liên hệ đang online, active, hay offline để tương tác realtime tốt hơn.

## Behavior

- Socket connection cập nhật trạng thái presence.
- Presence state được mirror trong Redis với TTL.
- User status/activity status hiển thị ở các danh sách phù hợp.
- Online friends endpoint trả về bạn bè đang online/active.
- Presence updates được broadcast tới user liên quan.
- Heartbeat/presence không được ghi MongoDB liên tục.

## Done When

- User online được phản ánh cho bạn bè phù hợp.
- Disconnect/TTL làm trạng thái hết hạn an toàn.
- Redis unavailable không phá durable user data.
- Heartbeat không tạo write load vào MongoDB.
- Presence events không phát nhầm cho user không liên quan.
