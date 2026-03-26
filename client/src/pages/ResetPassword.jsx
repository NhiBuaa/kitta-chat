import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { resetPassword } from "../services/authService";
import { toast } from "react-toastify";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FaLock, FaEye, FaEyeSlash, FaKey, FaArrowLeft } from "react-icons/fa";

const ResetPassword = () => {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  // State để quản lý ẩn/hiện mật khẩu
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Theo dõi giá trị password để validate confirm password
  const password = watch("newPassword");

  const confirmPassword = watch("confirmPassword");

  const hasMinLength = password?.length >= 8;
  const hasUpper = /[A-Z]/.test(password || "");
  const hasLower = /[a-z]/.test(password || "");
  const hasNumber = /\d/.test(password || "");
  const hasSpecial = /[@$!%*?&]/.test(password || "");

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await resetPassword(id, token, data.newPassword);
      toast.success("Đổi mật khẩu thành công! Hãy đăng nhập.");

      // Chờ 1 chút để user đọc thông báo rồi chuyển trang
      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      toast.error(
        err.response?.data?.msg || "Link hết hạn hoặc mật khẩu không hợp lệ",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-blue-100 via-purple-200 to-pink-100">
      <div className="absolute top-[-120px] left-[-120px] w-[300px] h-[300px] bg-purple-300 rounded-full blur-3xl opacity-30"></div>
      <div className="absolute bottom-[-120px] right-[-120px] w-[300px] h-[300px] bg-blue-300 rounded-full blur-3xl opacity-30"></div>

      <div className="relative z-10 w-full max-w-md rounded-3xl shadow-2xl bg-white border border-white/30 overflow-hidden">
        {/* header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-center">
          <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <FaKey className="text-white text-2xl" />
          </div>

          <h2 className="text-3xl font-bold text-white">Đặt Lại Mật Khẩu</h2>

          <p className="text-blue-100 text-sm mt-2">
            Hãy nhập mật khẩu mới đủ mạnh để bảo vệ tài khoản của bạn
          </p>
        </div>

        {/* form */}
        <div className="p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* pass mới */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Mật khẩu mới
              </label>

              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type={showPassword ? "text" : "password"}
                  {...register("newPassword", {
                    required: "Vui lòng nhập mật khẩu mới",
                  })}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white/60 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
                  placeholder="Mật khẩu mới của bạn"
                />

                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-purple-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </div>
              </div>

              {errors.newPassword && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.newPassword.message}
                </p>
              )}

              <div className="text-xs mt-2 space-y-1">
                <p className={hasMinLength ? "text-green-500" : "text-red-400"}>
                  {hasMinLength ? "✔" : "✖"} Ít nhất 8 ký tự
                </p>

                <p className={hasUpper ? "text-green-500" : "text-red-400"}>
                  {hasUpper ? "✔" : "✖"} Có chữ in hoa
                </p>

                <p className={hasLower ? "text-green-500" : "text-red-400"}>
                  {hasLower ? "✔" : "✖"} Có chữ thường
                </p>

                <p className={hasNumber ? "text-green-500" : "text-red-400"}>
                  {hasNumber ? "✔" : "✖"} Có số
                </p>

                <p className={hasSpecial ? "text-green-500" : "text-red-400"}>
                  {hasSpecial ? "✔" : "✖"} Có ký tự đặc biệt
                </p>
              </div>
            </div>

            {/* xác nhận lại mk */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Nhập lại mật khẩu
              </label>

              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type={showConfirmPassword ? "text" : "password"}
                  {...register("confirmPassword", {
                    required: "Vui lòng xác nhận mật khẩu",
                    validate: (v) => v === password || "Mật khẩu không khớp",
                  })}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white/60 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Xác nhận mật khẩu mới"
                />

                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-purple-600"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </div>
              </div>

              <p className="text-xs mt-1 min-h-[18px]">
                {confirmPassword ? (
                  confirmPassword === password ? (
                    <span className="text-green-500">✔ Mật khẩu khớp</span>
                  ) : (
                    <span className="text-red-500">✖ Mật khẩu không khớp</span>
                  )
                ) : (
                  ""
                )}
              </p>
            </div>

            {/* nút */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-xl text-white font-semibold shadow-lg transition-all ${
                isLoading
                  ? "bg-gray-400"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-[1.02] hover:shadow-xl"
              }`}
            >
              {isLoading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>

          {/* về trang đăng nhập */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:opacity-80"
            >
              <FaArrowLeft className="mr-2" />
              Quay lại trang đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
