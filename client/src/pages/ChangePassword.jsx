import { useForm } from "react-hook-form";
import { changePassword } from "../services/authService";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const ChangePassword = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    try {
      await changePassword(data);
      toast.success("Đổi mật khẩu thành công!");
      navigate("/"); // Về trang chủ
    } catch (err) {
      toast.error(err.response?.data?.msg || "Lỗi đổi mật khẩu");
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-white rounded shadow mt-10">
      <h2 className="text-xl font-bold mb-4">Đổi Mật Khẩu</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-3">
          <label className="block mb-1">Mật khẩu hiện tại</label>
          <input
            {...register("currentPassword", { required: true })}
            type="password"
            class="w-full border p-2 rounded"
          />
        </div>

        <div className="mb-3">
          <label className="block mb-1">Mật khẩu mới</label>
          <input
            {...register("newPassword", { required: true, minLength: 6 })}
            type="password"
            class="w-full border p-2 rounded"
          />
          {errors.newPassword && (
            <span className="text-red-500 text-sm">Tối thiểu 6 ký tự</span>
          )}
        </div>

        <button
          type="submit"
          className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
        >
          Lưu thay đổi
        </button>
      </form>
    </div>
  );
};

export default ChangePassword;
