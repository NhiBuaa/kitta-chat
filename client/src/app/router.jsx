import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createElement, lazy, Suspense } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/services/auth/useAuth.js";

// Pages
import Login from "@/features/auth/pages/Login.jsx";
import Register from "@/features/auth/pages/Register.jsx";
import ForgotPassword from "@/features/auth/pages/ForgotPassword.jsx";
import ResetPassword from "@/features/auth/pages/ResetPassword.jsx";
import ChangePassword from "@/features/auth/pages/ChangePassword.jsx";
const Home = lazy(() => import("@/features/chat/pages/ChatPage.jsx"));
const VideoCallPage = lazy(() => import("@/features/calls/pages/CallPage.jsx"));

// Components
const CallNotification = lazy(() => import("@/features/calls/components/CallNotification.jsx"));
import LoopbackAuthenticatedChatFixture from '@/config/LoopbackAuthenticatedChatFixture.jsx';
import {
  RuntimeCapabilityGate,
  RuntimeCapabilityRoute,
} from '@/config/RuntimeCapabilityGate.js';

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

function App({
  Notifications = ToastContainer,
  Router = BrowserRouter,
  routerProps = {},
} = {}) {
  return createElement(
    Router,
    routerProps,
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<RuntimeCapabilityRoute capability="selfSignup"><PublicRoute><Register /></PublicRoute></RuntimeCapabilityRoute>} />
          <Route path="/forgot-password" element={<RuntimeCapabilityRoute capability="recovery"><PublicRoute><ForgotPassword /></PublicRoute></RuntimeCapabilityRoute>} />
          <Route path="/reset-password/:id" element={<RuntimeCapabilityRoute capability="recovery"><PublicRoute><ResetPassword /></PublicRoute></RuntimeCapabilityRoute>} />

          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="/call/:partnerId" element={<RuntimeCapabilityRoute capability="calls"><VideoCallPage /></RuntimeCapabilityRoute>} />
          <Route path="/__k6-test__/authenticated-chat" element={<LoopbackAuthenticatedChatFixture />} />

          {/* Route không tồn tại thì về trang chủ */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>

      <Suspense fallback={null}>
        <RuntimeCapabilityGate capability="calls">
          <CallNotification />
        </RuntimeCapabilityGate>
      </Suspense>

      {createElement(Notifications, { position: "top-right", autoClose: 3000 })}
    </>,
  );
}

export default App;
