const { normalizeRegistrationEmail } = require("../validation/syntheticEmailBoundary");

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

const createRegistrationController = ({
  userModel,
  passwordHasher,
  sessionIssuer,
}) => async (req, res) => {
  try {
    const {
      displayName,
      email,
      password,
      confirmPassword,
    } = req.body || {};
    const syntheticOnly = req.app?.get?.("capabilities")?.syntheticSignupOnly === true;

    if (!displayName || email === undefined || email === null || email === "" || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đủ thông tin",
      });
    }

    const emailResult = normalizeRegistrationEmail({ email, syntheticOnly });
    if (!emailResult.accepted) {
      const whitespace = emailResult.rejectionClass === "whitespace";
      return res.status(400).json({
        success: false,
        message: whitespace
          ? "Email và mật khẩu không được chứa khoảng trắng"
          : "Email không hợp lệ",
      });
    }
    if (/\s/u.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Email và mật khẩu không được chứa khoảng trắng",
      });
    }

    const userExists = await userModel.findOne({ email: emailResult.normalizedEmail });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt",
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu xác nhận không khớp",
      });
    }

    const salt = await passwordHasher.genSalt(10);
    const hashedPassword = await passwordHasher.hash(password, salt);
    const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&size=128`;
    const newUser = new userModel({
      email: emailResult.normalizedEmail,
      password: hashedPassword,
      displayName,
      avatar: defaultAvatarUrl,
    });

    await newUser.save();
    const authSession = sessionIssuer(res, newUser);

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      token: authSession.token,
      user: authSession.user,
    });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createRegistrationController,
};
