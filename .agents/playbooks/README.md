# Playbooks

Playbooks là checklist cho quy trình đã lặp lại nhiều lần trong dự án.

Phân biệt nhanh:

- `.agents/AGENTS.md`: AI nên làm việc như thế nào.
- `.agents/rules/`: domain/system invariants phải tuân theo.
- `specs/`: hành vi mong đợi của từng feature.
- `.agents/playbooks/`: checklist thao tác lặp lại khi debug, migrate, release, verify.

## Khi nào tạo/cập nhật

- Chỉ tạo sau khi đã debug/release/migrate theo cùng một pattern ít nhất 2-3 lần.
- Cập nhật khi checklist thực tế thay đổi sau một lần debug/migration/release thật.
- Không dùng playbook để ghi lý thuyết dài dòng.
- Không dùng playbook để ghi rule domain; rule domain nằm trong `.agents/rules/`.

## Playbooks hiện có

- [Debugging](./debugging.md)
- [Conversation Read Model Slice](./conversation-read-model-slice.md)
- [New Feature Implementation](./new-feature.md)

