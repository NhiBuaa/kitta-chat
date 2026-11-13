# Hướng Dẫn Triển Khai & Bảo Trì Hệ Thống KittaChat (Production Cloud Guide)

Tài liệu này ghi lại toàn bộ kiến trúc triển khai thực tế trên môi trường đám mây (Cloud Production) của KittaChat, bao gồm danh mục các nền tảng dịch vụ đang sử dụng (tối ưu hóa 100% chi phí 0 VNĐ), danh sách biến môi trường, tài khoản quản trị và quy trình vận hành bảo trì khi có sự cố.

---

## 1. Tổng Quan Kiến Trúc Đám Mây (Chi Phí 0 VNĐ)

KittaChat được thiết kế theo kiến trúc Micro-Cloud Serverless & Containerized, tận dụng triệt để các gói dịch vụ Free Tier trọn đời của các nhà cung cấp đám mây hàng đầu:

```
[ Người dùng / Trình duyệt ]
        │
        ├──> (DNS: Cloudflare nhibuaa.space)
        │
        ├──> [ Frontend: Vercel ] (https://kitta.nhibuaa.space)
        │       │  (Reverse-Proxy /api/* qua client/vercel.json)
        │       ▼
        └──> [ Backend: Render Web Service ] (https://api-kitta.nhibuaa.space)
                │
                ├──> [ Database: MongoDB Atlas ] (M0 Free Tier, Singapore ap-southeast-1)
                ├──> [ Cache & Realtime: Upstash Redis ] (Serverless Redis, TLS/SSL)
                ├──> [ Background Queue: CloudAMQP ] (Little Lemur RabbitMQ)
                ├──> [ Media & File Storage: Cloudflare R2 ] (S3-compatible, 10 GB Free, Egress 0đ)
                └──> [ Keep-Alive Ping: cron-job.org ] (Ping /healthz mỗi 10 phút chống ngủ đông)
```

---

## 2. Chi Tiết Các Nền Tảng Lưu Trữ & Hạ Tầng

| Thành Phần | Nhà Cung Cấp | Gói Dịch Vụ | Tên Miền / Địa Chỉ Truy Cập | Mục Đích Sử Dụng |
|---|---|---|---|---|
| **Frontend** | [Vercel](https://vercel.com) | Hobby (Free) | `https://kitta.nhibuaa.space` | Build & phân phối giao diện React (Vite). Tự động deploy khi merge vào nhánh `main`. |
| **Backend API** | [Render](https://render.com) | Free Web Service | `https://api-kitta.nhibuaa.space` | Chạy Node.js Express REST API và Socket.IO WebSockets. Tự động deploy khi có commit mới trên `main`. |
| **Cơ Sở Dữ Liệu** | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | M0 Cluster (512MB) | AWS Singapore (`ap-southeast-1`) | Cơ sở dữ liệu chính lưu trữ Users, Messages, Conversations, Groups, Files. Database: `kittachat`. |
| **Bộ Nhớ Đệm & Adapter** | [Upstash](https://upstash.com) | Serverless Redis (Free) | `ap-southeast-1` | Quản lý trạng thái online/offline (Presence), Socket.IO Redis Adapter phát tin realtime, rate limit. |
| **Hàng Đợi Nhiệm Vụ** | [CloudAMQP](https://www.cloudamqp.com) | Little Lemur (Free) | AWS Singapore | Hàng đợi RabbitMQ chạy ngầm các tác vụ nặng (xử lý ảnh đại diện, audit log, thông báo). |
| **Lưu Trữ Tệp & Ảnh** | [Cloudflare R2](https://dash.cloudflare.com) | 10 GB Free Storage | Bucket: `kittachat` | Lưu trữ ảnh và tệp tin đính kèm trong chat thay thế AWS S3 để tránh bị trừ tiền băng thông (0đ egress fee). |
| **Quản Lý Tên Miền** | [Cloudflare DNS](https://dash.cloudflare.com) | Free Zone | `nhibuaa.space` | Quản lý DNS, cấp chứng chỉ SSL toàn cầu, chống tấn công DDoS và tối ưu định tuyến. |
| **Chống Ngủ Đông** | [cron-job.org](https://cron-job.org) | Free Scheduler | Job: `kittachat` | Định kỳ 10 phút gửi HTTP GET tới `/healthz` để ngăn Render Free Web Service rơi vào trạng thái ngủ sau 15 phút. |

---

## 3. Cấu Hình Chi Tiết Từng Dịch Vụ

### 3.1. Frontend (Vercel)
- **GitHub Repository:** `NhiBuaa/kitta-chat`
- **Root Directory:** `client`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Cấu hình định tuyến (`client/vercel.json`):**
  - Rewrite `/(.*)` về `/` để hỗ trợ SPA React Router (tránh lỗi 404 khi người dùng F5 hoặc đăng xuất).
  - Reverse Proxy `/api/:path*` trỏ thẳng sang `https://api-kitta.nhibuaa.space/api/:path*` để tránh lỗi CORS và đồng bộ cookie phiên đăng nhập.
- **DNS Cloudflare:**
  - Bản ghi `CNAME`: `kitta` $\rightarrow$ `cname.vercel-dns.com`
  - **Trạng thái Proxy:** `DNS only` (đám mây xám - bắt buộc để Vercel tự cấp phát và gia hạn chứng chỉ SSL Let's Encrypt).

### 3.2. Backend (Render Web Service)
- **Tên dịch vụ:** `kitta-chat`
- **Root Directory:** `server`
- **Environment:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `node src/index.js`
- **Custom Domain:** `api-kitta.nhibuaa.space`
- **DNS Cloudflare:**
  - Bản ghi `CNAME`: `api-kitta` $\rightarrow$ `<tên-máy-chủ-render>.onrender.com`
  - **Trạng thái Proxy:** `Proxied` (đám mây cam) hoặc `DNS only`.

### 3.3. Object Storage (Cloudflare R2)
- **Account ID:** `0815469773bb9f83177a1303be9a90f3`
- **Bucket Name:** `kittachat`
- **Vị trí (Location):** Asia-Pacific (APAC)
- **S3 API Endpoint:** `https://0815469773bb9f83177a1303be9a90f3.r2.cloudflarestorage.com`
- **Cấu hình CORS Policy:** Cần thiết lập trong *Settings* của bucket để trình duyệt có thể upload trực tiếp:
  ```json
  [
    {
      "AllowedOrigins": [
        "https://kitta.nhibuaa.space",
        "http://localhost:5173"
      ],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
- **Public Development URL:** Bật nút `Enable` trong *Settings* để sinh URL công khai dạng `https://pub-<id>.r2.dev` cho phép người dùng xem được ảnh/file trong chat.

### 3.4. Keep-Alive Uptime Monitor (cron-job.org)
- **URL cần ping:** `https://api-kitta.nhibuaa.space/healthz`
- **Method:** `GET`
- **Tần suất (Schedule):** Mỗi `10 phút` (Every 10 minutes)
- **Lưu ý:** Render Free sẽ ngủ đông sau 15 phút không có request. Cronjob 10 phút đảm bảo server luôn thức sẵn sàng, loại bỏ hoàn toàn độ trễ 60s khởi động lại.

---

## 4. Bảng Tổng Hợp Biến Môi Trường (Environment Variables)

Dưới đây là danh sách toàn bộ các biến môi trường cần cấu hình trên **Render Web Service** (mục *Environment*):

| Tên Biến (Key) | Bắt Buộc | Ý Nghĩa / Giá Trị Mẫu |
|---|---|---|
| `NODE_ENV` | Có | `production` |
| `PORT` | Có | `10000` (Render tự động inject hoặc dùng 10000) |
| `URL_FRONTEND` | Có | `https://kitta.nhibuaa.space` |
| `CORS_ALLOWED_ORIGINS` | Có | `https://kitta.nhibuaa.space,http://localhost:5173` |
| `MONGO_URI` | Có | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/kittachat?retryWrites=true&w=majority` |
| `JWT_SECRET` | Có | Chuỗi ngẫu nhiên dài bảo mật token đăng nhập |
| `REFRESH_TOKEN_SECRET`| Có | Chuỗi ngẫu nhiên dài bảo mật refresh cookie |
| `AUTH_COOKIE_SECURE` | Có | `true` (Bắt buộc trong production để cookie truyền qua HTTPS) |
| `REDIS_URL` | Có | `rediss://default:<password>@<endpoint>.upstash.io:6379` |
| `RABBITMQ_URL` | Có | `amqps://<user>:<password>@<host>/<vhost>` |
| `CONVERSATION_DUAL_WRITE_ENABLED` | **Rất quan trọng** | `true` (Kích hoạt ghi đồng bộ tin nhắn mới vào danh sách Sidebar; nếu thiếu biến này, khi F5 sẽ bị mất tin nhắn mới trên sidebar) |
| `AWS_S3_BUCKET_NAME` | Có | `kittachat` |
| `AWS_REGION` | Có | `auto` |
| `AWS_ENDPOINT` | Có | `https://0815469773bb9f83177a1303be9a90f3.r2.cloudflarestorage.com` |
| `AWS_ACCESS_KEY_ID` | Có | Cloudflare R2 Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | Có | Cloudflare R2 Secret Access Key |
| `AWS_PUBLIC_URL` | Có | Đường link `https://pub-<id>.r2.dev` của Cloudflare R2 |

---

## 5. Dữ Liệu Mẫu & Tài Khoản Demo (Seed Data)

Khi cần khởi tạo lại hoặc reset toàn bộ dữ liệu mẫu ban đầu để demo cho nhà tuyển dụng/khách hàng:

1. Chạy lệnh seed trên máy local trỏ vào Mongo Atlas:
   ```powershell
   cd server
   $env:MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/kittachat?retryWrites=true&w=majority"
   npm run seed:demo
   ```
2. **Danh sách tài khoản Demo sẵn sàng kiểm thử:**
   - **Tài khoản chính (Alice):** `alice@kittachat.test` / Mật khẩu: `KittaChatDemo!2026`
   - **Tài khoản đối ứng (Bob):** `bob@kittachat.test` / Mật khẩu: `KittaChatDemo!2026`
   - Dữ liệu có sẵn: 19 người dùng, 6 nhóm trò chuyện, 24 cuộc hội thoại với đầy đủ tin nhắn, tệp đính kèm và lịch sử cuộc gọi mẫu.

---

## 6. Sổ Tay Xử Lý Sự Cố Thường Gặp (Troubleshooting Runbook)

### Sự Cố 1: Trang web vào lần đầu bị chậm hoặc trắng màn hình
- **Nguyên nhân:** Render Free đang trong trạng thái Cold Start (ngủ đông) sau thời gian dài không có lượt truy cập, mất từ 50-80 giây để container khởi động lại.
- **Khắc phục:** Kiểm tra lại trang `cron-job.org`. Đảm bảo job `kittachat` đang ở trạng thái **Active** (không bị `Inactive` hay `Failed`), method là `GET` trỏ tới `https://api-kitta.nhibuaa.space/healthz`.

### Sự Cố 2: Nhắn tin realtime thì thấy, nhưng F5 lại mất tin nhắn trên sidebar
- **Nguyên nhân:** Thiếu biến môi trường `CONVERSATION_DUAL_WRITE_ENABLED` trên Render khiến backend chỉ lưu vào bảng `Message` mà không đồng bộ sang `ConversationParticipant`.
- **Khắc phục:** Vào Render $\rightarrow$ `Environment` $\rightarrow$ Thêm `CONVERSATION_DUAL_WRITE_ENABLED=true` và lưu lại.

### Sự Cố 3: Lỗi upload ảnh / file (`Region is missing` hoặc `400 Bad Request`)
- **Nguyên nhân:** Thiếu biến cấu hình Cloudflare R2 hoặc CORS trên R2 chưa cấu hình cho phép domain `https://kitta.nhibuaa.space`.
- **Khắc phục:**
  1. Kiểm tra 6 biến `AWS_*` trên Render xem đã điền đầy đủ chưa.
  2. Vào Cloudflare Dashboard $\rightarrow$ R2 $\rightarrow$ Bucket `kittachat` $\rightarrow$ Tab *Settings* $\rightarrow$ Kiểm tra lại khối JSON CORS Policy và đảm bảo có `"ExposeHeaders": ["ETag"]`.

### Sự Cố 4: Khi F5 hoặc gõ URL trực tiếp (ví dụ `/login`, `/call`) bị lỗi 404 Vercel
- **Nguyên nhân:** Thiếu rewrite SPA trên Vercel.
- **Khắc phục:** Kiểm tra file `client/vercel.json` trong repository, đảm bảo có quy tắc rewrite `/(.*) -> /`.
