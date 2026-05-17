import { useForm } from "react-hook-form";
import { forgotPassword } from "@/services/api/authApi.js";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { FaPaperPlane, FaArrowLeft } from "react-icons/fa";

const ForgotPassword = () => {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      await forgotPassword(data);
      toast.success(
        "Nếu email tồn tại, hãy kiểm tra email của bạn chúng tôi đã gửi link reset.",
      );
    } catch (err) {
      toast.error(err.response?.data?.msg || "Lỗi gửi yêu cầu");
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-[#F4FBF6]">
      <div className="relative z-10 max-w-md w-full bg-white border border-[#D7EEDD] rounded-3xl shadow-lg p-8 rounded-3xl transition-all duration-300">
        {/* header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
            <FaPaperPlane
              className="transition-transform duration-300 group-hover:rotate-12"
              size={22}
            />
          </div>

          <h2 className="text-2xl font-extrabold text-[#4CAF50] tracking-tight">
            Quên mật khẩu?
          </h2>

          <p className="text-gray-500 mt-2 text-sm">
            Nhập email để nhận hướng dẫn đặt lại mật khẩu
          </p>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium mx-1 text-gray-700">
              Email đã đăng ký
            </label>

            <input
              {...register("email", {
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Hãy nhập email hợp lệ",
                },
                validate: (value) =>
                  !/\s/.test(value) || "Email không được chứa khoảng trắng",
              })}
              onChange={(e) => {
                const value = e.target.value.replace(/\s/g, "").toLowerCase();
                setValue("email", value, { shouldValidate: true });
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-[#D7EEDD] bg-white focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] outline-none transition-all duration-200 shadow-sm focus:shadow-md mb-1"
              placeholder="Email của bạn"
            />
            <p className="text-red-500 text-xs min-h-[18px]">
              {errors.email?.message || ""}
            </p>
          </div>

          {/* nút gửi link */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] text-white font-semibold py-2.5 rounded-xl hover:scale-[1.02] hover:shadow-xl transition-all duration-200"
          >
            {isSubmitting ? "Đang gửi..." : "Gửi Link Reset"}
          </button>
        </form>
        {/* về đnhap */}
        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="flex items-center justify-center text-sm font-medium text-[#4CAF50] hover:underline transition"
          >
            <FaArrowLeft className="mr-2" /> Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
