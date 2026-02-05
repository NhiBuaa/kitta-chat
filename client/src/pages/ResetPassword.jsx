import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { resetPassword } from "../services/authService";
import { toast } from "react-toastify";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FaLock, FaEye, FaEyeSlash, FaKey } from "react-icons/fa";

const ResetPassword = () => {
    const { id, token } = useParams();
    const navigate = useNavigate();
    const { register, handleSubmit, watch, formState: { errors } } = useForm();

    // State để quản lý ẩn/hiện mật khẩu
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Theo dõi giá trị password để validate confirm password
    const password = watch("newPassword");

    const onSubmit = async (data) => {
        setIsLoading(true);
        try {
            await resetPassword(id, token, data.newPassword);
            toast.success("Đổi mật khẩu thành công! Hãy đăng nhập.");

            // Chờ 1 chút để user đọc thông báo rồi chuyển trang
            setTimeout(() => {
                navigate("/login");
            }, 1500);
        } catch (err) {
            toast.error(err.response?.data?.msg || "Link hết hạn hoặc không hợp lệ");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-100 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all hover:scale-[1.01] duration-300">

                {/* Header Section */}
                <div className="bg-blue-600 p-8 text-center">
                    <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <FaKey className="text-white text-3xl" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Đặt Lại Mật Khẩu</h2>
                    <p className="text-blue-100 text-sm">Hãy nhập mật khẩu mới đủ mạnh để bảo vệ tài khoản của bạn.</p>
                </div>

                {/* Form Section */}
                <div className="p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                        {/* Mật khẩu mới */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 pl-1">Mật khẩu mới</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaLock className="text-gray-400" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${errors.newPassword ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                                    placeholder="••••••••"
                                    {...register("newPassword", {
                                        required: "Vui lòng nhập mật khẩu mới",
                                        minLength: { value: 6, message: "Mật khẩu phải có ít nhất 6 ký tự" }
                                    })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 cursor-pointer focus:outline-none"
                                >
                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                            {errors.newPassword && <p className="text-red-500 text-xs mt-1 ml-1 flex items-center">⚠ {errors.newPassword.message}</p>}
                        </div>

                        {/* Xác nhận mật khẩu */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 pl-1">Nhập lại mật khẩu</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaLock className="text-gray-400" />
                                </div>
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${errors.confirmPassword ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                                    placeholder="••••••••"
                                    {...register("confirmPassword", {
                                        required: "Vui lòng xác nhận mật khẩu",
                                        validate: value => value === password || "Mật khẩu không khớp"
                                    })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 cursor-pointer focus:outline-none"
                                >
                                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1 ml-1 flex items-center">⚠ {errors.confirmPassword.message}</p>}
                        </div>

                        {/* Button Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all duration-300 ${isLoading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-1 hover:shadow-xl'
                                }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Đang xử lý...
                                </span>
                            ) : "Xác nhận đổi mật khẩu"}
                        </button>
                    </form>

                    {/* Back to Login */}
                    <div className="mt-6 text-center">
                        <Link to="/login" className="text-sm text-gray-500 hover:text-blue-600 hover:underline transition-colors">
                            ← Quay lại trang đăng nhập
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;