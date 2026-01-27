import { useForm } from "react-hook-form";
import { register as registerAPI } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import { FaUser, FaEnvelope, FaLock } from "react-icons/fa";

const Register = () => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
    const navigate = useNavigate();

    const onSubmit = async (data) => {
        try {
            await registerAPI(data);
            toast.success("Đăng ký thành công! Hãy đăng nhập.");
            navigate("/login");
        } catch (err) {
            toast.error(err.response?.data?.msg || "Lỗi đăng ký");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 md:p-12 transform transition-all">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-800">Tạo tài khoản</h2>
                    <p className="text-gray-500 mt-2">Tham gia cộng đồng chat miễn phí</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    {/* Display Name Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaUser className="text-gray-400" />
                        </div>
                        <input
                            {...register("displayName", { required: "Tên hiển thị là bắt buộc" })}
                            className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
                            placeholder="Tên hiển thị"
                        />
                        {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>}
                    </div>

                    {/* Email Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaEnvelope className="text-gray-400" />
                        </div>
                        <input
                            {...register("email", { required: "Email là bắt buộc", pattern: { value: /^\S+@\S+$/i, message: "Email không hợp lệ" } })}
                            className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
                            placeholder="Email của bạn"
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                    </div>

                    {/* Password Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaLock className="text-gray-400" />
                        </div>
                        <input
                            type="password"
                            {...register("password", { required: "Mật khẩu là bắt buộc", minLength: { value: 6, message: "Tối thiểu 6 ký tự" } })}
                            className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
                            placeholder="Mật khẩu"
                        />
                        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition duration-300 shadow-lg"
                    >
                        {isSubmitting ? "Đang tạo..." : "Đăng Ký Ngay"}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-gray-600 border-t pt-6">
                    Đã có tài khoản? <Link to="/login" className="text-blue-600 font-bold hover:underline">Đăng nhập</Link>
                </div>
            </div>
        </div>
    );
};
export default Register;