import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/services/auth/AuthProvider.jsx";

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

// Component bảo vệ Route (Kiểm tra xem đã login chưa)
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isChecking } = useAuth();

  if (isChecking) return null;

  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Component ngăn user đã login truy cập lại trang login/register
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isChecking } = useAuth();

  if (isChecking) return null;

  return isAuthenticated ? <Navigate to="/" /> : children;
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
