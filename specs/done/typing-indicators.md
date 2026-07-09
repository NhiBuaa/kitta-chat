# Typing Indicators

## Why

Người dùng cần tín hiệu realtime khi người khác đang nhập trong direct hoặc group chat.

## Behavior

- Client gửi typing event qua Socket.IO.
- Server forward typing state tới room/user phù hợp.
- Typing indicator là ephemeral realtime state.
- Typing indicator không được lưu bền vững trong MongoDB.
- Listener cleanup phía client phải tránh duplicate handlers.

## Done When

- Người nhận thấy typing indicator gần realtime.
- Indicator biến mất khi user ngừng nhập hoặc rời context.
- Không có durable database writes cho typing state.
- Không leak typing event sang conversation/group không liên quan.
