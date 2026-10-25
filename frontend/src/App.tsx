import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import AdminBootstrap from "./pages/AdminBootstrap";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AppShell from "./pages/AppShell";
import ProviderDirectory from "./pages/ProviderDirectory";
import ProviderSetup from "./pages/ProviderSetup";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import Appointments from "./pages/Appointments";
import AdminCreateProvider from "./pages/AdminCreateProvider";
import AdminOverview from "./pages/AdminOverview";
import Payments from "./pages/Payments";
import AdminPayments from "./pages/AdminPayments";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RoleHome() {
  const { session } = useAuth();
  return <Navigate to={session?.role === "admin" ? "/admin/overview" : "/providers"} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/bootstrap" element={<AdminBootstrap />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="/payments" element={<Payments />} />
        <Route path="/admin/providers" element={<AdminCreateProvider />} />
        <Route path="/admin/overview" element={<AdminOverview />} />
        <Route path="/admin/payments" element={<AdminPayments />} />
        <Route path="/" element={<RoleHome />} />
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
