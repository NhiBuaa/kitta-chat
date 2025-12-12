const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Check tồn tại
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ msg: 'Email đã tồn tại' });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo user
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ msg: 'Đăng ký thành công' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Tìm user
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Sai email hoặc mật khẩu' });

        // Check pass
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Sai email hoặc mật khẩu' });

        // Tạo Token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Trả về info user (trừ password)
        const { password: _, ...userInfo } = user._doc;
        res.json({ token, user: userInfo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);

        // Check pass cũ
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Mật khẩu hiện tại không đúng' });

        // Hash pass mới
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Đổi mật khẩu thành công' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Email không tồn tại" });

    // Tạo token reset (ngắn hạn 15p)
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // Gửi mail (Cấu hình mail server của bạn ở đây)
    const transporter = nodemailer.createTransport({ /* config mail */ });
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    await transporter.sendMail({
        to: email,
        subject: "Reset Password",
        html: `<a href="${resetUrl}">Nhấn vào đây để đặt lại mật khẩu</a>`
    });

    res.json({ msg: "Đã gửi email reset mật khẩu" });
};

exports.resetPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);

        // Check pass cũ
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Mật khẩu hiện tại không đúng' });

        // Hash pass mới
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Đổi mật khẩu thành công' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.logout = async (req, res) => {
    
}