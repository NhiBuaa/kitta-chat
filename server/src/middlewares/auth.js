const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    // Lấy token từ header Client gửi lên
    // Định dạng chuẩn: "Bearer <token>" -> Cần tách lấy phần token phía sau
    const authHeader = req.header("Authorization");
    const token = authHeader && authHeader.split(" ")[1];

    // Nếu không có token
    if (!token) {
        return res.status(401).json({ msg: "Truy cập bị từ chối. Vui lòng đăng nhập!" });
    }

    try {
        // Giải mã token bằng Secret Key (đã lưu trong .env)
        const verified = jwt.verify(token, process.env.JWT_SECRET);

        // Nếu đúng -> Gán dữ liệu user (thường là id) vào biến req
        // Để các controller phía sau có thể dùng (ví dụ: req.user.id)
        req.user = verified;

        // Cho phép đi tiếp
        next();
    } catch (err) {
        res.status(403).json({ msg: "Token không hợp lệ hoặc đã hết hạn!" });
    }
};

module.exports = verifyToken;