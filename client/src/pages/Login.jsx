import { useForm } from "react-hook-form";
import { useState } from "react";
import { login, loginWithGoogle } from "../services/authService";
import { loginWithGoogleFirebase } from "../firebase";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";

import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm();
  const navigate = useNavigate();

  const inputClass =
    "pl-10 w-full px-4 py-3 rounded-xl border border-[#D7EEDD] bg-white focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50] outline-none transition-all duration-200 shadow-sm focus:shadow-md";
  const onSubmit = async (data) => {
    try {
      const res = await login(data);

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.dispatchEvent(new Event("auth-changed"));

      toast.success(`Chào mừng ${res.data.user.displayName} quay trở lại!`);
      navigate("/");
    } catch (err) {
      toast.error(
        err.response?.data?.msg || "Tài khoản hoặc mật khẩu không chính xác",
      );
    }
  };

  // xử lý đăng nhập Google
  const handleGoogleLogin = async () => {
    try {
      const result = await loginWithGoogleFirebase();
      const token = await result.getIdToken();

      // test lay token
      // console.log("TOKEN:", token);
      const res = await loginWithGoogle({
        token,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.dispatchEvent(new Event("auth-changed"));

      toast.success(`Chào mừng ${res.data.user.displayName}!`);
      navigate("/");
    } catch (err) {
      console.error(err);
      toast.error("Đăng nhập Google thất bại");
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F4FBF6]">
      <div className="bg-white border border-[#D7EEDD] rounded-3xl shadow-lg flex w-full max-w-4xl overflow-hidden">
        {/* Cột trái: Hình ảnh/Intro (Ẩn trên mobile) */}
        <div className="hidden md:flex w-1/2 bg-gradient-to-br from-[#4CAF50] to-[#81C784] text-white flex-col justify-center items-center p-12 relative">
          <div className="z-10 text-center">
            <h2 className="text-4xl font-bold mb-4">KittaChat</h2>
            <p className="text-green-100">
              Kết nối bạn bè, trò chuyện không giới hạn
            </p>
          </div>
          <div
            className="absolute top-0 left-0 w-full h-full bg-cover opacity-20"
            style={{
              backgroundImage:
                'url("https://source.unsplash.com/random/800x600/?technology")',
            }}
          ></div>
        </div>

        {/* Cột phải: Form */}
        <div className="w-full md:w-1/2 p-8 md:p-12">
          <h2 className="text-3xl font-extrabold text-[#4CAF50] text-center mb-2">
            Đăng nhập
          </h2>
          <p className="text-gray-500 text-center mt-2 mb-8">
            Điền thông tin để truy cập vào tài khoản
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mx-1 block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaEnvelope className="text-[#66BB6A]" />
                </div>
                <input
                  {...register("email", {
                    required: "Email là bắt buộc",
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    },
                    validate: (value) =>
                      !/\s/.test(value) || "Email không được chứa khoảng trắng",
                  })}
                  onChange={(e) => {
                    const value = e.target.value
                      .replace(/\s/g, "")
                      .toLowerCase();
                    setValue("email", value, { shouldValidate: true });
                  }}
                  className={inputClass}
                  placeholder="Email của bạn"
                />
              </div>
              <p className="text-red-500 text-xs mt-1 min-h-[18px]">
                {errors.email?.message || ""}
              </p>
            </div>

            <div>
              <label className="mx-1 block text-sm font-medium text-gray-700 mb-1">
                Mật khẩu
              </label>
              {/* pass */}
              <div className="space-y-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FaLock className="text-[#66BB6A]" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    {...register("password", {
                      required: "Vui lòng nhập mật khẩu",
                      validate: (value) =>
                        !/\s/.test(value) ||
                        "Mật khẩu không được chứa khoảng trắng",
                    })}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\s/g, "");
                      setValue("password", value, { shouldValidate: true });
                    }}
                    className={inputClass + " pr-10"}
                    placeholder="Mật khẩu của bạn"
                  />
                  <div
                    className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <FaEyeSlash className="text-[#66BB6A] hover:text-[#4CAF50] transition" />
                    ) : (
                      <FaEye className="text-[#66BB6A] hover:text-[#4CAF50] transition" />
                    )}
                  </div>
                </div>
              </div>

              <p className="text-red-500 text-xs min-h-[18px]">
                {errors.password?.message}
              </p>
              <div className="flex justify-between items-center mb-1">
                <Link
                  to="/forgot-password"
                  className="text-xs mx-1 text-green-600 hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] hover:from-[#43A047] hover:to-[#388E3C] text-white font-semibold py-3 rounded-xl hover:scale-[1.02] hover:shadow-xl transition"
            >
              {isSubmitting ? "Đang xử lý..." : "Đăng Nhập"}
            </button>
          </form>
          <div className="my-4 flex items-center">
            <div className="flex-grow border-t"></div>
            <span className="mx-2 text-gray-400 text-sm">hoặc</span>
            <div className="flex-grow border-t"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full border border-gray-300 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 transition"
          >
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              className="w-5 h-5"
            />
            Đăng nhập với Google
          </button>

          <div className="mt-6 text-center text-sm text-gray-600">
            Chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-semibold text-[#4CAF50] hover:text-[#388E3C] hover:opacity-80"
            >
              Đăng ký ngay
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
