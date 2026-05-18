const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    const authHeader = req.header("Authorization");
    const token = authHeader && authHeader.split(" ")[1];

    // Nếu không có token
    if (!token) {
        return res.status(401).json({ msg: "Truy cập bị từ chối. Vui lòng đăng nhập!" });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(403).json({ msg: "Token không hợp lệ hoặc đã hết hạn!" });
    }
};

const getUserIdFromToken = (token) => {
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        return verified.id;
    } catch (err) {
        console.error("Lỗi xác thực token:", err);
        return null;
    }
}

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.getUserIdFromToken = getUserIdFromToken;
