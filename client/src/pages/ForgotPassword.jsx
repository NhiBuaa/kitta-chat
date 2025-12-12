import { useForm } from "react-hook-form";
import { forgotPassword } from "../services/authService";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { FaPaperPlane, FaArrowLeft } from "react-icons/fa";

const ForgotPassword = () => {
    const { register, handleSubmit, formState: { isSubmitting } } = useForm();

    const onSubmit = async (data) => {
        try {
            await forgotPassword(data);
            toast.success("Đã gửi link reset! Hãy kiểm tra email.");
        } catch (err) {
            toast.error(err.response?.data?.msg || "Lỗi gửi yêu cầu");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaPaperPlane size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Quên mật khẩu?</h2>
                    <p className="text-gray-500 mt-2 text-sm">Đừng lo, hãy nhập email để chúng tôi gửi hướng dẫn.</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email đã đăng ký</label>
                        <input
                            {...register("email", { required: true })}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="name@example.com"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
                    >
                        {isSubmitting ? "Đang gửi..." : "Gửi Link Reset"}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link to="/login" className="flex items-center justify-center text-gray-500 hover:text-gray-800 transition text-sm">
                        <FaArrowLeft className="mr-2" /> Quay lại đăng nhập
                    </Link>
                </div>
            </div>
        </div>
    );
};
export default ForgotPassword;