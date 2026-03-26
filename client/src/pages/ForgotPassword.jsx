import { useForm } from "react-hook-form";
import { forgotPassword } from "../services/authService";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { FaPaperPlane, FaArrowLeft } from "react-icons/fa";

const ForgotPassword = () => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      await forgotPassword(data);
      toast.success("Đã gửi link reset! Hãy kiểm tra email.");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Lỗi gửi yêu cầu");
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-blue-100 via-purple-200 to-pink-100">
      <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] bg-purple-300 rounded-full blur-3xl opacity-30"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[300px] h-[300px] bg-blue-300 rounded-full blur-3xl opacity-30"></div>

      <div className="relative z-10 max-w-md w-full bg-white backdrop-blur-2xl border border-white/30 p-8 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] hover:shadow-[0_30px_80px_rgba(0,0,0,0.15)] transition-all duration-300 group">
        {/* header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <FaPaperPlane
              className="transition-transform duration-300 group-hover:rotate-12"
              size={22}
            />
          </div>

          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
            Quên mật khẩu?
          </h2>

          <p className="text-gray-500 mt-2 text-sm">
            Nhập email để nhận hướng dẫn đặt lại mật khẩu
          </p>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Email đã đăng ký
            </label>

            <input
              {...register("email", { required: true })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/60 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 shadow-sm focus:shadow-md"
              placeholder="name@example.com"
            />
          </div>

          {/* nút gửi link */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 rounded-xl hover:scale-[1.03] active:scale-[0.97] hover:shadow-xl transition-all duration-200"
          >
            {isSubmitting ? "Đang gửi..." : "Gửi Link Reset"}
          </button>
        </form>
        {/* về đnhap */}
        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="flex items-center justify-center text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:underline hover:scale-105 transition"
          >
            <FaArrowLeft className="mr-2" /> Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
