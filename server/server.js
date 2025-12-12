const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/user");
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middlewares
app.use(express.json());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Start Server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));

// (Sau này sẽ gắn Socket.io vào biến 'server' này)