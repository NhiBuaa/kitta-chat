# Test Case — Call History + Missed Call Notification
## Phase 1–5 Complete (Post-Implementation)

---

## 1. Badge Count (Sidebar)

### TC-B01: Badge hiện đúng số cuộc gọi nhỡ chưa đọc
- **Pre-condition:** User A có 2 cuộc gọi nhỡ từ User B (missed), 1 từ User C (unreachable) — tất cả chưa đọc
- **Steps:**
  1. Login với tài khoản A
  2. Để ý icon `FaHistory` trên Sidebar header
- **Expected:** Badge đỏ hiện số `3` (hoặc `9+` nếu ≥10)
- **Expected (chi tiết):**
  - Badge có animation ping (vòng tròn nhấp nháy đỏ)
  - Số hiển thị ≤ 9 → hiện đúng số; > 9 → hiện `9+`

### TC-B02: Badge ẩn khi không có cuộc gọi nhỡ
- **Pre-condition:** User A không có cuộc gọi nhỡ nào
- **Steps:** Login với tài khoản A, kiểm tra icon `FaHistory` trên Sidebar
- **Expected:** Badge không hiện, chỉ thấy icon `FaHistory`

### TC-B03: Badge giảm sau khi đọc
- **Pre-condition:** User A có 2 cuộc gọi nhỡ chưa đọc → badge hiện `2`
- **Steps:**
  1. Mở Call History Modal (bấm icon `FaHistory`)
  2. Đóng modal
- **Expected:** Badge giảm về `0` sau khi đóng modal

---

## 2. Call History Modal

### TC-M01: Mở modal từ Sidebar
- **Steps:**
  1. Login → thấy Sidebar
  2. Bấm icon `FaHistory` (có hoặc không có badge)
- **Expected:**
  - Modal panel trượt từ **bên phải**
  - Header: mũi tên `FaArrowLeft` + "Lịch sử cuộc gọi"
  - Backdrop mờ phủ toàn màn hình
  - 4 tabs hiển thị: Tất cả | Nhỡ | Đã gọi | Đã nhận

### TC-M02: Đóng modal khi bấm backdrop
- **Steps:**
  1. Mở Call History Modal
  2. Bấm ra vùng backdrop (ngoài modal)
- **Expected:** Modal đóng, backdrop mất

### TC-M03: Tabs lọc đúng dữ liệu
- **Pre-condition:** A có đủ các loại call: completed (gọi đi), missed (nhỡ), rejected (từ chối), unreachable
- **Steps:**
  1. Mở Call History Modal
  2. Lần lượt bấm từng tab
- **Expected:**
  - Tab **"Tất cả"**: hiện tất cả cuộc gọi
  - Tab **"Nhỡ"**: chỉ hiện status `missed`, `rejected`, `unreachable`, `busy`
  - Tab **"Đã gọi"**: chỉ hiện cuộc gọi A gọi đi (outgoing)
  - Tab **"Đã nhận"**: chỉ hiện cuộc gọi A nhận vào (incoming)

### TC-M04: Tab "Nhỡ" không hiện cuộc gọi completed
- **Pre-condition:** A có cuộc gọi completed và cuộc gọi missed
- **Steps:**
  1. Mở Call History Modal
  2. Chuyển sang tab "Nhỡ"
- **Expected:** Tất cả items trong tab đều có status `missed`/`rejected`/`unreachable`/`busy` — không có `completed`

### TC-M05: Tab "Đã gọi" chỉ hiện outgoing
- **Pre-condition:** A đã gọi đi 1 cuộc (completed) và nhận 1 cuộc (missed)
- **Steps:**
  1. Mở Call History Modal → tab "Đã gọi"
- **Expected:** Chỉ hiện item mà A là caller (A → B), không có B → A

### TC-M06: Search theo tên
- **Pre-condition:** Có ≥2 cuộc gọi với 2 người khác nhau
- **Steps:**
  1. Mở Call History Modal
  2. Gõ tên một người vào ô search
- **Expected:** Danh sách lọc chỉ hiện cuộc gọi với người có tên chứa từ khóa (không phân biệt hoa/thường)

### TC-M07: Infinite scroll — load thêm khi cuộn xuống
- **Pre-condition:** Backend có ≥25 cuộc gọi cho user A
- **Steps:**
  1. Mở Call History Modal → tab "Tất cả"
  2. Cuộn xuống cuối danh sách
- **Expected:** Spinner hiện → thêm cuộc gọi được append vào danh sách
- **Expected (hết):** Khi đến record cuối cùng: hiện text "Đã hiển thị tất cả", không còn spinner

### TC-M08: Nút "Gọi lại" hiện đúng trạng thái
- **Pre-condition:** A có cuộc gọi missed từ B và cuộc gọi completed với C
- **Steps:**
  1. Mở Call History Modal
  2. Tìm item có status `missed` → kiểm tra nút Gọi lại
  3. Tìm item có status `completed` → kiểm tra nút Gọi lại
- **Expected:**
  - Status `missed`/`rejected`/`unreachable`/`busy` → **có nút "Gọi lại"** (nền đỏ)
  - Status `completed` → **KHÔNG có nút "Gọi lại"**

### TC-M09: Nút "Gọi lại" mở cửa sổ gọi đúng người
- **Pre-condition:** A có cuộc gọi missed từ B
- **Steps:**
  1. Mở Call History Modal → tab "Nhỡ"
  2. Bấm nút "Gọi lại" trên item của B
  3. Switch sang cửa sổ vừa mở
- **Expected:**
  - URL: `/call/:b-userId`
  - Tên hiển thị trên CallPage là tên của B
  - Avatar hiển thị đúng avatar của B

### TC-M10: Badge reset ngay khi mở modal
- **Pre-condition:** A có 2 cuộc gọi nhỡ chưa đọc → badge `2`
- **Steps:**
  1. Quan sát badge → hiện `2`
  2. Bấm icon `FaHistory`
- **Expected:** Badge về `0` **ngay lập tức** sau khi modal mở (trước cả khi fetch xong)

### TC-M11: Empty state khi không có cuộc gọi
- **Pre-condition:** User A chưa có cuộc gọi nào
- **Steps:**
  1. Mở Call History Modal
- **Expected:**
  - Icon `FaPhone` to ở giữa (opacity 40%)
  - Text "Không có cuộc gọi nào"

---

## 3. Inline Call Log (trong ChatWindow)

### TC-IL01: Call log hiện trong message thread
- **Pre-condition:** A vừa kết thúc cuộc gọi video với B (completed)
- **Steps:**
  1. A đang chat với B
  2. Cuộn lên trên message list
- **Expected:** Trong danh sách message, xuất hiện `<CallLogItem>`:
  - Text: "Bạn đã gọi [B]" (outgoing) hoặc "[B] đã gọi bạn" (incoming)
  - Icon: `FaVideo` hoặc `FaPhone`
  - Nền xanh nhạt (completed)

### TC-IL02: Missed call log màu đỏ
- **Pre-condition:** B gọi A → A không trả lời trong 45s → missed
- **Steps:**
  1. A đang chat với B
  2. Cuộn lên message list
- **Expected:**
  - CallLogItem có nền đỏ nhạt (`bg-red-50`)
  - Text màu đỏ: "Bạn đã bỏ lỡ cuộc gọi video từ [B]"
  - Icon `FaVideo`

### TC-IL03: Rejected call log
- **Pre-condition:** B gọi A → A bấm Reject
- **Steps:**
  1. A đang chat với B
  2. Tìm CallLogItem
- **Expected:** Nền cam nhạt, text "Bạn đã từ chối cuộc gọi video từ [B]"

### TC-IL04: Nút "Gọi lại" trên CallLogItem
- **Pre-condition:** A có call log missed trong chat với B
- **Steps:**
  1. Hover vào CallLogItem
  2. Bấm nút `FaPhoneVolume` (Gọi lại)
- **Expected:** Cửa sổ CallPage mở ra, gọi đúng B

### TC-IL05: Call log không hiện nút Gọi lại khi completed
- **Pre-condition:** A có call log completed với B
- **Steps:**
  1. Hover vào CallLogItem completed
  2. Quan sát các nút bên phải
- **Expected:** Không có nút "Gọi lại" vì cuộc gọi đã hoàn thành

---

## 4. Missed Call Toast

### TC-T01: Toast hiện khi có cuộc gọi nhỡ (A offline → online)
- **Pre-condition:**
  - A offline
  - B gọi A → server tạo `CallHistory` status `unreachable`
- **Steps:**
  1. A đăng nhập (online)
  2. Đợi 1–2 giây
- **Expected:**
  - Toast popup góc dưới-phải
  - Hiện avatar + tên B + "Cuộc gọi nhỡ"
  - 2 nút: "Xem chat" + "Gọi lại"

### TC-T02: Toast hiện khi A đang ở tab khác, B gọi rồi timeout
- **Pre-condition:** A đang ở Home (đang chat với C khác)
- **Steps:**
  1. B gọi A
  2. A không trả lời trong 45s
- **Expected:**
  - Toast hiện ở góc dưới-phải
  - Text: "Bạn vừa lỡ cuộc gọi video từ [B]"
  - Toast không có nút Answer

### TC-T03: Toast KHÔNG hiện khi đang ở đúng conversation của B
- **Pre-condition:** A đang chat A↔B
- **Steps:**
  1. B gọi A → A không trả lời trong 45s
- **Expected:**
  - Toast **KHÔNG** hiện (vì CallLogItem đã hiện trong thread)
  - Nhưng badge `FaHistory` vẫn tăng

### TC-T04: Nút "Gọi lại" trên toast
- **Pre-condition:** A nhận toast missed call từ B
- **Steps:**
  1. Bấm nút "Gọi lại" trên toast
- **Expected:** Cửa sổ CallPage mở, gọi đúng B

### TC-T05: Nút "Xem chat" trên toast → mở conversation
- **Pre-condition:** A nhận toast missed call từ B (B không nằm trong sidebar)
- **Steps:**
  1. Bấm nút "Xem chat" trên toast
- **Expected:**
  - Toast đóng
  - Sidebar: B được chọn → ChatWindow hiện cuộc trò chuyện A↔B

### TC-T06: Toast tự đóng sau 4.5s
- **Pre-condition:** A nhận toast missed call
- **Steps:**
  1. Quan sát toast khi nó xuất hiện
  2. KHÔNG tương tác
  3. Đợi 5 giây
- **Expected:** Toast tự động biến mất sau ~4.5s

### TC-T07: Toast không trùng lặp
- **Pre-condition:** B gọi A 2 lần liên tiếp (2 cuộc nhỡ)
- **Steps:**
  1. Quan sát toast
- **Expected:** Mỗi toast có `toastId` khác nhau → hiện 2 toast riêng biệt (không ghi đè)

---

## 5. Server-side Timeout (45s)

### TC-TMO01: Server tự động chuyển missed sau 45s
- **Pre-condition:** A bấm gọi B (A online, B online)
- **Steps:**
  1. A bấm "Gọi Video" → B nhận mini card nhưng **KHÔNG** bấm Answer
  2. Đợi 45 giây
- **Expected:**
  - Server chuyển `CallHistory.status` → `"missed"`
  - Message `type: "call_log"` được tạo trong DB với `status: "missed"`
  - Server emit `callMissed` event → A nhận toast (nếu A KHÔNG đang ở chat A↔B)

### TC-TMO02: Timeout bị hủy khi người nhận trả lời
- **Pre-condition:** A bấm gọi B
- **Steps:**
  1. A bấm "Gọi Video"
  2. B bấm "Answer" sau 10 giây
  3. Cuộc gọi kết nối bình thường
  4. Đợi thêm 60 giây (vượt quá 45s)
- **Expected:**
  - Call record có `status: "completed"`, KHÔNG phải `"missed"`
  - Timeout đã bị cancel, KHÔNG có duplicate event

### TC-TMO03: Timeout bị hủy khi người nhận bấm Reject
- **Pre-condition:** A bấm gọi B
- **Steps:**
  1. A bấm "Gọi Video"
  2. B bấm "Reject" sau 5 giây
  3. Đợi thêm 50 giây
- **Expected:**
  - Call record có `status: "rejected"`, KHÔNG phải `"missed"`
  - Timeout không trigger

---

## 6. End-to-End Flows

### TC-E2E01: Flow completed — cuộc gọi nối thành công
| Step | Actor | Action | Expected |
|------|-------|--------|----------|
| 1 | A | Mở chat với B → bấm "Gọi Video" | Cửa sổ CallPage mở, đang chờ |
| 2 | B | Mini card hiện ở B | Bấm "Answer" |
| 3 | B | Bấm "Answer" | WebRTC kết nối, video hiện ở cả 2 |
| 4 | A hoặc B | 1 người bấm "Kết thúc" | CallPage chuyển sang trạng thái ended |
| 5 | A | Quay lại Home → mở chat A↔B | CallLogItem hiện trong thread: "Bạn đã gọi [B] · Thời lượng XX:XX" (xanh) |
| 6 | Server | Kiểm tra DB | `CallHistory.status = "completed"`, `Message.type = "call_log"`, `duration` đúng |

### TC-E2E02: Flow missed — không trả lời
| Step | Actor | Action | Expected |
|------|-------|--------|----------|
| 1 | A | Gọi B → B không trả lời | Đợi 45 giây |
| 2 | Server | Timeout trigger | `CallHistory.status = "missed"` |
| 3 | A | Đang ở Home (không chat B) | Toast "Bạn vừa lỡ cuộc gọi video từ [B]" hiện |
| 4 | A | Bấm "Gọi lại" trên toast | Cửa sổ CallPage mở, gọi B |
| 5 | A | Quay lại Home → mở chat A↔B | CallLogItem: nền đỏ, "Bạn đã bỏ lỡ cuộc gọi video từ [B]" |
| 6 | Badge | Quan sát Sidebar | Badge `1` hiện trên `FaHistory` |

### TC-E2E03: Flow rejected — người nhận từ chối
| Step | Actor | Action | Expected |
|------|-------|--------|----------|
| 1 | A | Gọi B | B mini card hiện |
| 2 | B | Bấm "Reject" | Server: `status = "rejected"` |
| 3 | A | CallPage hiện message | "Cuộc gọi bị từ chối" |
| 4 | A | Mở chat A↔B | CallLogItem: "Cuộc gọi video đến [B] đã bị từ chối" (cam nhạt) |
| 5 | B (người từ chối) | B mở chat B↔A | **KHÔNG** có CallLogItem (B là người từ chối, không phải người nhận) |

### TC-E2E04: Flow unreachable — người nhận offline
| Step | Actor | Action | Expected |
|------|-------|--------|----------|
| 1 | A | Gọi B (B offline) | A thấy message "Người dùng hiện không trực tuyến" |
| 2 | Server | Tạo `CallHistory` status `"unreachable"` | KHÔNG emit event cho B (B offline) |
| 3 | B | B đăng nhập (về online) | Toast hiện: "Bạn vừa lỡ cuộc gọi video từ [A]" |
| 4 | B | Mở chat B↔A | CallLogItem: "Bạn đã bỏ lỡ cuộc gọi video từ [A]" |

### TC-E2E05: Flow busy — người nhận đang bận cuộc gọi khác
| Step | Actor | Action | Expected |
|------|-------|--------|----------|
| 1 | A | Gọi B (B đang trong cuộc gọi khác) | A thấy message "Người dùng đang bận" |
| 2 | Server | `CallHistory.status = "busy"` | |
| 3 | A | Mở chat A↔B | CallLogItem: "Cuộc gọi video đến [B] · Người dùng đang bận" |

---

## 7. Idempotency & Edge Cases

### TC-IDM01: endCall được gọi 2 lần
- **Pre-condition:** Cuộc gọi đang kết nối
- **Steps:**
  1. A bấm "Kết thúc"
  2. A bấm lại "Kết thúc" (hoặc network retry)
- **Expected:**
  - Server chỉ xử lý **1 lần** (kiểm tra `endedBy` field)
  - DB: `CallHistory` chỉ có 1 record được update, không có duplicate
  - Không có lỗi crash server

### TC-IDM02: Auto-cleanup pending record kẹt
- **Pre-condition:** Server restart trong khi có cuộc gọi `pending` (A gọi B, chưa answered)
- **Steps:**
  1. A gọi B → server tạo `pending` record
  2. Server crash/restart
  3. Đợi 2 phút
- **Expected:** Cleanup job chạy → record chuyển thành `unreachable`

### TC-IDM03: User refresh trang giữa cuộc gọi
- **Pre-condition:** A đang trong cuộc gọi với B
- **Steps:**
  1. A refresh trang (F5)
- **Expected:**
  - Nếu call đã kết thúc (B đã bấm end): call hiện trong history bình thường
  - Nếu call đang pending: call vẫn tồn tại trong DB, A có thể tiếp tục

### TC-IDM04: Glare — A và B gọi nhau cùng lúc
- **Pre-condition:** A và B mở CallPage cùng lúc, cả 2 đều bấm gọi đối phương
- **Steps:**
  1. A bấm gọi B
  2. B bấm gọi A (chênh lệch 1-2 giây)
- **Expected:**
  - Server chọn winner dựa trên `socket.id` (cái nào nhỏ hơn)
  - Winner → call bình thường, Loser → nhận `callRejected { reason: 'busy' }`
  - Cả A và B đều thấy đúng trạng thái

### TC-IDM05: A gọi liên tục 1 người (DDoS spam)
- **Pre-condition:** A cố gắng gọi B 15 lần liên tiếp trong 1 phút
- **Steps:**
  1. A bấm gọi B (lặp lại 10+ lần nhanh)
- **Expected:** Server rate-limit → từ lần thứ 11, server từ chối emit `callUser` trong 1 phút
  - A nhận feedback: "Bạn đang gọi quá nhanh, vui lòng chờ"

---

## 8. Security

### TC-SEC01: User không đọc được call history của người khác
- **Steps:**
  1. Login với tài khoản A
  2. Gọi API trực tiếp: `GET /api/calls/history`
- **Expected:** Response chỉ chứa cuộc gọi mà A là caller HOẶC receiver

### TC-SEC02: User không đọc `readBy` array của người khác
- **Pre-condition:** A và B có cuộc gọi với nhau
- **Steps:**
  1. A gọi `GET /api/calls/history`
  2. Kiểm tra payload trả về
- **Expected:** Trường `readBy` **KHÔNG** có trong response (server đã filter chỉ trả `isRead: boolean`)

### TC-SEC03: Token hết hạn → tự động logout
- **Steps:**
  1. Sửa token trong localStorage thành token giả
  2. Reload trang
- **Expected:** Bị redirect về `/login`, không thấy dữ liệu call history

---

## 9. Performance

### TC-PERF01: Badge count query nhanh (<50ms)
- **Pre-condition:** DB có ~5000 CallHistory records
- **Steps:**
  1. Developer tools → Network → đo thời gian `GET /api/calls/missed`
- **Expected:** Response < 50ms (dùng compound index `{receiverId, status, readBy}`)

### TC-PERF02: Cursor-based pagination không skip records
- **Pre-condition:** Backend có 30 cuộc gọi
- **Steps:**
  1. Load page 1 → gọi page 2
  2. Insert thêm 1 cuộc gọi mới ở giữa
  3. Gọi page 3
- **Expected:** Không có record nào bị skip hoặc trùng lặp giữa các trang

---

## 10. Summary Checklist

| # | Test Case | Priority | Status |
|---|----------|----------|--------|
| TC-B01 | Badge hiện đúng số | P0 | |
| TC-B02 | Badge ẩn khi không có | P0 | |
| TC-B03 | Badge giảm sau khi đọc | P0 | |
| TC-M01 | Mở modal từ Sidebar | P0 | |
| TC-M03 | Tabs lọc đúng dữ liệu | P0 | |
| TC-M08 | Nút Gọi lại hiện đúng status | P0 | |
| TC-M10 | Badge reset ngay khi mở modal | P0 | |
| TC-IL01 | Call log hiện trong message thread | P0 | |
| TC-IL02 | Missed call log màu đỏ | P0 | |
| TC-T01 | Toast hiện khi offline → online | P1 | |
| TC-T02 | Toast hiện khi A đang tab khác | P1 | |
| TC-T03 | Toast KHÔNG hiện khi đang đúng conversation | P1 | |
| TC-TMO01 | Server timeout 45s → missed | P0 | |
| TC-E2E01 | Flow completed | P0 | |
| TC-E2E02 | Flow missed | P0 | |
| TC-E2E03 | Flow rejected | P0 | |
| TC-E2E04 | Flow unreachable | P0 | |
| TC-E2E05 | Flow busy | P1 | |
| TC-IDM01 | endCall 2 lần idempotent | P1 | |
| TC-IDM04 | Glare handling | P1 | |
| TC-SEC01 | Security: không đọc history người khác | P0 | |
| TC-PERF01 | Badge count < 50ms | P2 | |
