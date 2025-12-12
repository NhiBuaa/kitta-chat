import { useForm } from "react-hook-form";
import { resetPassword } from "../services/authService";
import { toast } from "react-toastify";
import { useParams, useNavigate } from "react-router-dom";

const ResetPassword = () => {
    const { token } = useParams(); // Lấy token từ URL
    const navigate = useNavigate();
    const { register, handleSubmit, watch, formState: { errors } } = useForm();

    // Theo dõi giá trị password để validate confirm password
    const password = watch("newPassword");

    const onSubmit = async (data) => {
        try {
            await resetPassword(token, data.newPassword);
            toast.success("Đổi mật khẩu thành công! Hãy đăng nhập.");
            navigate("/login");
        } catch (err) {
            toast.error(err.response?.data?.msg || "Link hết hạn hoặc không hợp lệ");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6 text-center text-green-600">Đặt Lại Mật Khẩu</h2>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="mb-4">
                        <label className="block text-gray-700">Mật khẩu mới</label>
                        <input
                            type="password"
                            {...register("newPassword", { required: "Nhập mật khẩu mới", minLength: { value: 6, message: "Tối thiểu 6 ký tự" } })}
                            className="w-full p-2 border rounded mt-1"
                        />
                        {errors.newPassword && <p className="text-red-500 text-sm">{errors.newPassword.message}</p>}
                    </div>

                    <div className="mb-6">
                        <label className="block text-gray-700">Nhập lại mật khẩu</label>
                        <input
                            type="password"
                            {...register("confirmPassword", {
                                required: true,
                                validate: value => value === password || "Mật khẩu không khớp"
                            })}
                            className="w-full p-2 border rounded mt-1"
                        />
                        {errors.confirmPassword && <p className="text-red-500 text-sm">{errors.confirmPassword.message}</p>}
                    </div>

                    <button type="submit" className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600">
                        Xác nhận
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;