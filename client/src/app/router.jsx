import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { axiosClient } from "@/services/api/axiosClient.js";
import { clearAuthSession, getAccessToken } from "@/services/auth/authSession.js";

// Pages
import Login from "@/features/auth/pages/Login.jsx";
import Register from "@/features/auth/pages/Register.jsx";
import ForgotPassword from "@/features/auth/pages/ForgotPassword.jsx";
import ResetPassword from "@/features/auth/pages/ResetPassword.jsx";
import ChangePassword from "@/features/auth/pages/ChangePassword.jsx";
import Home from "@/features/chat/pages/ChatPage.jsx";
import VideoCallPage from '@/features/calls/pages/CallPage.jsx';

// Components
import CallNotification from '@/features/calls/components/CallNotification.jsx';

// Xử lý token hết hạn
axiosClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Nếu Backend trả về lỗi
    if (error.response && error.response.status === 403) {
      console.log("Token hết hạn, đang đăng xuất...");
      // Xóa sạch dữ liệu cũ
      clearAuthSession();
      window.dispatchEvent(new Event("auth-changed"));

      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Component bảo vệ Route (Kiểm tra xem đã login chưa)
const ProtectedRoute = ({ children }) => {
  const token = getAccessToken();
  return token ? children : <Navigate to="/login" />;
};

// Component ngăn user đã login truy cập lại trang login/register
const PublicRoute = ({ children }) => {
  const token = getAccessToken();
  return token ? <Navigate to="/" /> : children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password/:id/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />

        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/call/:partnerId" element={<VideoCallPage />} />

        {/* Route không tồn tại thì về trang chủ */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      <CallNotification />

      <ToastContainer position="top-right" autoClose={3000} />
    </BrowserRouter>
  );
}

export default App;
