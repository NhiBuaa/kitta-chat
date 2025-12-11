import { useForm } from "react-hook-form";
import { register as registerAPI } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const Register = () => {
    const { register, handleSubmit } = useForm();
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
        <form onSubmit={handleSubmit(onSubmit)} className="p-4">
            <input {...register("username")} placeholder="Username" className="border p-2 block w-full mb-2" />
            <input {...register("email")} placeholder="Email" className="border p-2 block w-full mb-2" />
            <input {...register("password")} type="password" placeholder="Password" className="border p-2 block w-full mb-2" />
            <button type="submit" className="bg-blue-500 text-white p-2 w-full">Đăng Ký</button>
        </form>
    );
};
export default Register;