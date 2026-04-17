import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { resetPassword } from "../services/authService";
import { toast } from "react-toastify";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FaLock, FaEye, FaEyeSlash, FaKey, FaArrowLeft } from "react-icons/fa";
import { FiCheck, FiX } from "react-icons/fi";
const ResetPassword = () => {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

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
        err.response?.data?.message || "Có lỗi xảy ra, vui lòng thử lại",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-[#F4FBF6]">
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-white border border-[#D7EEDD] rounded-3xl shadow-lg overflow-hidden">
        {/* header */}
        <div className="text-center mb-1 p-10 bg-gradient-to-r from-[#C8E6C9] to-[#E8F5E9]">
          <div className="w-16 h-16 bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
            <FaKey className="text-xl" />
          </div>

          <h2 className="text-2xl font-extrabold text-[#4CAF50]">
            Đặt lại mật khẩu
          </h2>

          <p className="text-gray-500 text-sm mt-1">
            Hãy nhập mật khẩu mới để bảo vệ tài khoản
          </p>
        </div>

        {/* form */}
        <div className="p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
            {/* pass mới */}
            <div>
              <label className="mx-1 text-sm font-semibold text-gray-700 mb-2 block">
                Mật khẩu mới
              </label>

              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type={showPassword ? "text" : "password"}
                  {...register("newPassword", {
                    required: "Vui lòng nhập mật khẩu mới",
                    validate: (value) => {
                      if (/\s/.test(value)) {
                        return "Mật khẩu không được chứa khoảng trắng";
                      }

                      if (!passwordRegex.test(value)) {
                        return "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt";
                      }

                      return true;
                    },
                  })}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\s/g, "");
                    setValue("newPassword", value, { shouldValidate: true });
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#D7EEDD] bg-white focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] outline-none transition-all shadow-sm focus:shadow-md"
                  placeholder="Mật khẩu mới của bạn"
                />

                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#66BB6A] hover:text-[#4CAF50] transition"
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

              <div className="text-xs mt-2">
                <p
                  className={`flex items-center gap-1 text-xs ${hasNumber ? "text-[#4CAF50]" : "text-red-400"}`}
                >
                  {hasNumber ? <FiCheck size={18} /> : <FiX size={18} />}
                  <span>Có số</span>
                </p>

                <p
                  className={`flex items-center gap-1 text-xs ${hasUpper ? "text-[#4CAF50]" : "text-red-400"}`}
                >
                  {hasUpper ? <FiCheck size={18} /> : <FiX size={18} />}
                  <span>Có chữ in hoa</span>
                </p>

                <p
                  className={`flex items-center gap-1 text-xs ${hasMinLength ? "text-[#4CAF50]" : "text-red-400"}`}
                >
                  {hasMinLength ? <FiCheck size={18} /> : <FiX size={18} />}
                  <span>Ít nhất 8 ký tự</span>
                </p>

                <p
                  className={`flex items-center gap-1 text-xs ${hasLower ? "text-[#4CAF50]" : "text-red-400"}`}
                >
                  {hasLower ? <FiCheck size={18} /> : <FiX size={18} />}
                  <span>Có chữ thường</span>
                </p>

                <p
                  className={`flex items-center gap-1 text-xs ${hasSpecial ? "text-[#4CAF50]" : "text-red-400"}`}
                >
                  {hasSpecial ? <FiCheck size={18} /> : <FiX size={18} />}
                  <span>Có ký tự đặc biệt</span>
                </p>
              </div>
            </div>

            {/* xác nhận lại mk */}
            <div>
              <label className="mx-1 text-sm font-semibold text-gray-700 mb-2 block">
                Nhập lại mật khẩu
              </label>

              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type={showConfirmPassword ? "text" : "password"}
                  {...register("confirmPassword", {
                    required: "Vui lòng xác nhận mật khẩu",
                    validate: (v) => {
                      if (/\s/.test(v)) return "Không được chứa khoảng trắng";
                      if (v !== password) return "Mật khẩu không khớp";
                      return true;
                    },
                  })}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\s/g, "");
                    setValue("confirmPassword", value, {
                      shouldValidate: true,
                    });
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#D7EEDD] bg-white focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] outline-none transition-all shadow-sm focus:shadow-md"
                  placeholder="Xác nhận mật khẩu mới"
                />

                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#66BB6A] hover:text-[#4CAF50] transition"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </div>
              </div>

              <p className="text-xs mt-2 min-h-[18px]">
                {confirmPassword ? (
                  confirmPassword === password ? (
                    <span className="flex items-center gap-1 text-[#4CAF50]">
                      <FiCheck size={18} />
                      Mật khẩu khớp
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400">
                      <FiX size={18} />
                      Mật khẩu không khớp
                    </span>
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
              className={`w-full py-2.5 rounded-xl text-white font-semibold transition-all ${
                isLoading
                  ? "bg-gray-400"
                  : "bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] hover:scale-[1.02] hover:shadow-xl"
              }`}
            >
              {isLoading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>

          {/* về trang đăng nhập */}
          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-medium text-[#4CAF50] hover:underline transition"
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
