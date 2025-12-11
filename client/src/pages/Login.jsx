import { useForm } from "react-hook-form";
import { login } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const Login = () => {
    const { register, handleSubmit } = useForm();
    const navigate = useNavigate();

    const onSubmit = async (data) => {
        try {
            const res = await login(data);
            // Lưu token và user info
            localStorage.setItem("token", res.data.token);
            localStorage.setItem("user", JSON.stringify(res.data.user));

            toast.success("Đăng nhập thành công!");
            navigate("/"); // Chuyển về trang chat
        } catch (err) {
            toast.error(err.response?.data?.msg || "Lỗi đăng nhập");
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="p-4">
            <input {...register("email")} placeholder="Email" className="border p-2 block w-full mb-2" />
            <input {...register("password")} type="password" placeholder="Password" className="border p-2 block w-full mb-2" />
            <button type="submit" className="bg-green-500 text-white p-2 w-full">Đăng Nhập</button>
        </form>
    );
};
export default Login;