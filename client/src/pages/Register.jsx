import { useForm } from "react-hook-form";
import { register as registerAPI } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import { FaUser, FaEnvelope, FaLock, FaPassport } from "react-icons/fa";

const Register = () => {
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm({ criteriaMode: "all" });

  const navigate = useNavigate();
  const password = watch("password");

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 md:p-12 transform transition-all">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-800">
            Đăng ký tài khoản KittaChat
          </h2>
          <p className="text-gray-500 mt-2">Tham gia cộng đồng chat miễn phí</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Display Name Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaUser className="text-gray-400" />
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
                  message: "Tên hiển thị chỉ được chứa chữ cái và khoảng trắng",
                },
                validate: (value) =>
                  value.trim().length > 0 || "Tên không hợp lệ",
              })}
              className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
              placeholder="Tên hiển thị"
            />
            {errors.displayName && (
              <p className="text-red-500 text-xs mt-1">
                {errors.displayName.message}
              </p>
            )}
          </div>

          {/* Email Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaEnvelope className="text-gray-400" />
            </div>
            <input
              {...register("email", {
                required: "Vui lòng nhập email để đăng ký",
                pattern: { value: /^\S+@\S+$/i, message: "Email không hợp lệ" },
              })}
              className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
              placeholder="Email của bạn"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaLock className="text-gray-400" />
            </div>
            <input
              type="password"
              {...register("password", {
                required: "Vui lòng nhập mật khẩu để đăng ký",
                validate: {
                  hasMinLength: (v) => v.length >= 8 || "Ít nhất 8 ký tự",
                  hasUpper: (v) =>
                    /[A-Z]/.test(v) || "Cần ít nhất 1 chữ in hoa",
                  hasLower: (v) =>
                    /[a-z]/.test(v) || "Cần ít nhất 1 chữ thường",
                  hasNumber: (v) => /\d/.test(v) || "Cần ít nhất 1 số",
                  hasSpecial: (v) =>
                    /[@$!%*?&]/.test(v) || "Cần ít nhất 1 ký tự đặc biệt",
                },
              })}
              onChange={() => trigger("confirmPassword")}
              className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
              placeholder="Mật khẩu"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">
                Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và
                ký tự đặc biệt
              </p>
            )}
          </div>

          {/* Nhập lại Password */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaLock className="text-gray-400" />
            </div>
            <input
              type="password"
              {...register("confirmPassword", {
                required: "Vui lòng xác nhận mật khẩu",
                validate: (v) =>
                  v.trim() === password?.trim() || "Mật khẩu không khớp",
              })}
              className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
              placeholder="Nhập lại mật khẩu"
            />

            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition duration-300 shadow-lg"
          >
            {isSubmitting ? "Đang tạo..." : "Đăng ký ngay"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-600 border-t pt-6">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-blue-600 font-bold hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};
export default Register;
