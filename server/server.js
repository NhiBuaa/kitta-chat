const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// --- Middlewares ---
app.use(express.json());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

// --- Routes ---
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

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));

// (Sau này sẽ gắn Socket.io vào biến 'server' này)