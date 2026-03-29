import { useForm } from "react-hook-form";
import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FiCheck, FiX } from "react-icons/fi";
import { register as registerAPI } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import { FaUser, FaEnvelope, FaLock, FaPassport } from "react-icons/fa";

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    // control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ mode: "onChange" });

  const navigate = useNavigate();
  const password = watch("password", "");
  const confirmPassword = watch("confirmPassword", "");

  // dùng cho các ô
  const inputClass =
    "pl-10 w-full px-4 py-3 rounded-xl border border-[#D7EEDD] bg-white focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] outline-none transition-all duration-200 shadow-sm focus:shadow-md";
  // ktra độ mạnh pass
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[@$!%*?&]/.test(password);

  const onSubmit = async (data) => {
    try {
      await registerAPI(data);
      toast.success("Đăng ký thành công! Hãy đăng nhập.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.message || "Lỗi đăng ký");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F4FBF6]">
      <div className="bg-white border border-[#D7EEDD] rounded-3xl shadow-lg w-full max-w-md p-8 md:p-10 transition-all">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-[#4CAF50]">
            Đăng ký KittaChat
          </h2>
          <p className="text-gray-500 mt-1">Tham gia cộng đồng chat miễn phí</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-1">
          {/* Display Name Input */}

          <div className="space-y-2 min-h-[72px]">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaUser className="text-[#66BB6A]" />
              </div>

              <input
                {...register("displayName", {
                  required: "Tên hiển thị là bắt buộc",
                  minLength: {
                    value: 2,
                    message: "Tên hiển thị phải có ít nhất 2 ký tự",
                  },
                  maxLength: {
                    value: 30,
                    message: "Tên hiển thị không được vượt quá 30 ký tự",
                  },
                  pattern: {
                    value: /^[A-Za-zÀ-ỹà-ỹ\s]+$/,
                    message:
                      "Tên hiển thị chỉ được chứa chữ cái và khoảng trắng",
                  },
                  validate: (value) =>
                    value.trim().length > 0 || "Tên không hợp lệ",
                })}
                className={inputClass}
                placeholder="Tên hiển thị"
              />
            </div>
            <div className="flex justify-between items-center mt-1">
              <p className="text-red-500 text-xs min-h-[18px]">
                {errors.displayName?.message || ""}
              </p>

              <p className="text-xs text-gray-400">
                {watch("displayName")?.length || 0}/30
              </p>
            </div>
          </div>

          {/* Email Input */}
          <div className="space-y-2 min-h-[72px]">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaEnvelope className="text-[#66BB6A]" />
              </div>
              <input
                {...register("email", {
                  required: "Vui lòng nhập email để đăng ký",
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: "Hãy nhập email hợp lệ",
                  },
                })}
                className={inputClass}
                placeholder="Email của bạn"
              />
            </div>
            <p className="text-red-500 text-xs min-h-[18px]">
              {errors.email?.message || ""}
            </p>
          </div>

          {/* Password Input */}
          <div className="space-y-2 min-h-[140px]">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaLock className="text-[#66BB6A]" />
              </div>

              <input
                type={showPassword ? "text" : "password"}
                {...register("password", {
                  required: "Nhập mật khẩu",
                  validate: (value) =>
                    !/\s/.test(value) ||
                    "Mật khẩu không được chứa khoảng trắng",
                })}
                onChange={(e) => {
                  const value = e.target.value;

                  // xoá toàn bộ khoảng trắng
                  const noSpaceValue = value.replace(/\s/g, "");

                  setValue("password", noSpaceValue, {
                    shouldValidate: true,
                  });
                }}
                className={inputClass + " pr-10"}
                placeholder="Mật khẩu"
              />

              <div
                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <FaEyeSlash className="text-gray-500 hover:text-gray-700 transition" />
                ) : (
                  <FaEye className="text-gray-500 hover:text-gray-700 transition" />
                )}
              </div>
            </div>

            {/* check list */}
            <div className="text-xs mt-2 space-y-">
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
                className={`flex items-center gap-1  mb-2 text-xs ${hasSpecial ? "text-[#4CAF50]" : "text-red-400"}`}
              >
                {hasSpecial ? <FiCheck size={18} /> : <FiX size={18} />}
                <span>Có ký tự đặc biệt</span>
              </p>
            </div>
          </div>

          {/* Nhập lại Password */}
          <div className="space-y-2 min-h-[72px]">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaLock className="text-[#66BB6A]" />
              </div>
              <input
                type={showConfirm ? "text" : "password"}
                {...register("confirmPassword", {
                  required: "Xác nhận mật khẩu",
                  validate: (v) => {
                    if (/\s/.test(v))
                      return "Mật khẩu không được chứa khoảng trắng";
                    if (v !== password) return "Mật khẩu không khớp";
                    return true;
                  },
                })}
                onChange={(e) => {
                  const value = e.target.value;

                  // xoá khoảng trắng giống password
                  const noSpaceValue = value.replace(/\s/g, "");

                  setValue("confirmPassword", noSpaceValue, {
                    shouldValidate: true,
                  });
                }}
                className={inputClass + " pr-10"}
                placeholder="Nhập lại mật khẩu"
              />

              <div
                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? (
                  <FaEyeSlash className="text-gray-500 hover:text-gray-700 transition" />
                ) : (
                  <FaEye className="text-gray-500 hover:text-gray-700 transition" />
                )}
              </div>
            </div>

            <p className="text-xs min-h-[18px]">
              {confirmPassword ? (
                confirmPassword === password ? (
                  <span className="flex items-center gap- mb-2 text-[#4CAF50]">
                    <FiCheck size={18} />
                    Mật khẩu khớp
                  </span>
                ) : (
                  <span className="flex items-center gap-1 mb-2  text-red-400">
                    <FiX size={18} />
                    Mật khẩu không khớp
                  </span>
                )
              ) : (
                " "
              )}
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] text-white font-semibold py-3 rounded-xl hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-200"
          >
            {isSubmitting ? "Đang tạo..." : "Đăng ký ngay"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 border-t pt-4">
          Đã có tài khoản?{" "}
          <Link
            to="/login"
            className="font-semibold bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] bg-clip-text text-transparent hover:opacity-80 transition"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};
export default Register;
