import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Home from "./pages/Home";

// Component bảo vệ Route (Kiểm tra xem đã login chưa)
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
};

// Component ngăn user đã login truy cập lại trang login/register
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? <Navigate to="/" /> : children;
};

function App() {
  return (
    <BrowserRouter>
      {/* Container hiển thị thông báo toast toàn ứng dụng */}
      <ToastContainer position="top-right" autoClose={3000} />

      <Routes>
        {/* --- Public Routes (Ai cũng vào được hoặc chưa login mới vào được) --- */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        {/* Route reset password nhận token dynamic */}
        <Route path="/reset-password/:id/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />

        {/* --- Private Routes (Phải login mới vào được) --- */}
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

        {/* Route bắt tất cả các link linh tinh -> về trang chủ */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;