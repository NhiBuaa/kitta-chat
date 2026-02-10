import { useForm } from "react-hook-form";
import { login } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import { FaEnvelope, FaLock } from "react-icons/fa";
import { useSocket } from "../context/SocketContext";

const Login = () => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
    const navigate = useNavigate();
    const { socket } = useSocket();

    const onSubmit = async (data) => {
        try {
            const res = await login(data);
            localStorage.setItem("token", res.data.token);
            localStorage.setItem("user", JSON.stringify(res.data.user));
            // Emit addNewUser để server biết user này online
            if (socket) {
                console.log(`📤 Login: Emitting addNewUser với userId: ${res.data.user._id}`);
                socket.emit("addNewUser", res.data.user._id);
            }
            toast.success(`Chào mừng ${res.data.user.displayName} quay trở lại!`);
            navigate("/");
        } catch (err) {
            toast.error(err.response?.data?.msg || "Đăng nhập thất bại");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex w-full max-w-4xl overflow-hidden">

                {/* Cột trái: Hình ảnh/Intro (Ẩn trên mobile) */}
                <div className="hidden md:flex w-1/2 bg-blue-600 text-white flex-col justify-center items-center p-12 relative">
                    <div className="z-10 text-center">
                        <h2 className="text-4xl font-bold mb-4">KittaChat</h2>
                        <p className="text-indigo-200">Kết nối bạn bè, trò chuyện không giới hạn.</p>
                    </div>
                    {/* Họa tiết trang trí */}
                    <div className="absolute top-0 left-0 w-full h-full bg-cover opacity-20" style={{ backgroundImage: 'url("https://source.unsplash.com/random/800x600/?technology")' }}></div>
                </div>

                {/* Cột phải: Form */}
                <div className="w-full md:w-1/2 p-8 md:p-12">
                    <h2 className="text-3xl font-bold text-gray-800 text-center mb-2">Đăng Nhập</h2>
                    <p className="text-gray-500 text-center mb-8">Điền thông tin để truy cập vào tài khoản</p>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaEnvelope className="text-gray-400" />
                                </div>
                                <input
                                    {...register("email", { required: "Email là bắt buộc" })}
                                    className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition outline-none"
                                    placeholder="name@example.com"
                                />
                            </div>
                            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                            <div className="relative">

                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaLock className="text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    {...register("password", { required: "Vui lòng nhập mật khẩu" })}
                                    className="pl-10 w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                            <div className="flex justify-between items-center mb-1">
                                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">Quên mật khẩu?</Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition duration-300 shadow-lg transform hover:-translate-y-1"
                        >
                            {isSubmitting ? "Đang xử lý..." : "Đăng Nhập"}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-600">
                        Chưa có tài khoản? <Link to="/register" className="text-blue-600 font-bold hover:underline">Đăng ký ngay</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Login;