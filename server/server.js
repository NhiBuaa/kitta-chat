const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

// Load biến môi trường
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // Đặt mặc định là 3000

// --- Middlewares ---
app.use(express.json()); // Để server hiểu dữ liệu JSON từ client gửi lên
app.use(cors({
    origin: "http://localhost:5173", // Chỉ cho phép Frontend (Vite mặc định 5173) gọi vào
    credentials: true // Cho phép gửi cookie nếu cần
}));

// --- Database Connection ---
// Thay chuỗi kết nối của bạn vào file .env với key MONGO_URI
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chat_app")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));

// --- Routes ---
// Import các route auth đã làm ở bước trước
const authRoutes = require("./src/routes/auth");

app.use("/api/auth", authRoutes);

// Route test để đảm bảo server chạy
app.get("/", (req, res) => {
    res.send("Server is running on port " + PORT);
});

// --- Start Server ---
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// (Sau này sẽ gắn Socket.io vào biến 'server' này)