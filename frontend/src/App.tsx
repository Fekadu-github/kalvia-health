import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminLogin from "./pages/AdminLogin";
import AdminBootstrap from "./pages/AdminBootstrap";
import AppShell from "./pages/AppShell";
import ProviderDirectory from "./pages/ProviderDirectory";
import ProviderSetup from "./pages/ProviderSetup";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import Appointments from "./pages/Appointments";
import AdminCreateProvider from "./pages/AdminCreateProvider";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/bootstrap" element={<AdminBootstrap />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/providers" element={<ProviderDirectory />} />
        <Route path="/providers/setup" element={<ProviderSetup />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:caseId" element={<CaseDetail />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/admin/providers" element={<AdminCreateProvider />} />
        <Route path="/" element={<Navigate to="/providers" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
