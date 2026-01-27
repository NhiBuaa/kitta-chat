const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

exports.register = async (req, res) => {
    try {
        const { displayName, email, password } = req.body;

        if (!displayName || !email || !password) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đủ thông tin" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: "Email đã được sử dụng" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo avatar theo tên hiển thị
        const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&size=128`;

        const newUser = new User({
            // KHÔNG CÒN USERNAME
            email,
            password: hashedPassword,
            displayName,
            avatar: defaultAvatarUrl
        });

        await newUser.save();

        res.status(201).json({ success: true, message: "Đăng ký thành công", user: newUser });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Tìm bằng email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

        res.json({
            success: true,
            message: "Đăng nhập thành công",
            token,
            user: {
                id: user._id,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                status: user.status,
                activityStatus: user.activityStatus
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Kiểm tra email có tồn tại không
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "Email không tồn tại trong hệ thống" });
        }

        // Tạo token reset
        const resetToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );

        // Cấu hình Transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Tạo nội dung Email
        const resetUrl = `${process.env.URL_FRONTEND}/reset-password/${resetToken}`;

        const mailOptions = {
            from: `"Chat App Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Yêu cầu đặt lại mật khẩu - Chat App",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: #097bc7ff; text-align: center;">Yêu cầu Reset Mật khẩu</h2>
                    <p>Xin chào <strong>${user.displayName}</strong>,</p>
                    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
                    <p>Vui lòng nhấn vào nút bên dưới để tạo mật khẩu mới (Link chỉ có hiệu lực trong 15 phút):</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #097bc7ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Đặt lại mật khẩu ngay
                        </a>
                    </div>

                    <p style="color: #666; font-size: 12px;">Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;">
                    <p style="text-align: center; color: #999; font-size: 12px;">Chat App Team</p>
                </div>
            `
        };

        // Gửi mail
        await transporter.sendMail(mailOptions);

        return res.json({ success: true, message: `Đã gửi email hướng dẫn đến ${email}` });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server: Không thể gửi email" });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        // Lấy token từ URL
        const { token } = req.params;
        const { newPassword, confirmPassword } = req.body;

        // Validate cơ bản
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu xác nhận không khớp' });
        }

        // Giải mã Token để lấy User ID
        // Nếu token hết hạn hoặc sai, jwt.verify sẽ ném lỗi
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // Tìm user trong DB
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        // Hash password mới
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();

        res.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay.' });

    } catch (err) {
        console.error("Reset Password Error:", err);
        // Phân loại lỗi để báo cho client
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ success: false, message: 'Link reset đã hết hạn. Vui lòng yêu cầu lại.' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(400).json({ success: false, message: 'Link reset không hợp lệ.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};