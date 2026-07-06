# Rules

Thư mục này chứa quy tắc nghiệp vụ/domain mà AI và dev phải tuân theo khi sửa hệ thống.

Phân biệt nhanh:

- `.agents/AGENTS.md`: AI nên làm việc/code như thế nào.
- `.agents/rules/`: hệ thống phải tuân theo quy tắc domain gì.
- `specs/`: hành vi mong đợi của từng feature.
- `docs/decisions.md`: technical decision log append-only và lý do phía sau quyết định.

## Khi nào cập nhật

- Khi phát hiện một rule nghiệp vụ quan trọng cần AI luôn tuân theo.
- Khi một feature/migration tạo ra invariant lâu dài.
- Khi một bug cho thấy cần ghi rõ rule để tránh tái phạm.

## Quy tắc quản lý

- Dev sở hữu và duyệt nội dung rules.
- Không tạo rule nếu chỉ là process làm việc của AI.
- Không đưa trạng thái tạm thời hoặc test result vào rules.
- Nếu rule thay đổi, sửa file rule tương ứng và cân nhắc ghi thêm decision vào `docs/decisions.md` nếu đó là quyết định kỹ thuật quan trọng.

## Rule Files

- [Data Ownership](./data-ownership.md)
- [Conversation Identity](./conversation-identity.md)
- [Conversation Read Model Migration](./conversation-read-model-migration.md)
- [Realtime State](./realtime-state.md)
- [Auth Session](./auth-session.md)
- [Calls](./calls.md)
