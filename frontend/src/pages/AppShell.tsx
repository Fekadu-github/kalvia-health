import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AppShell() {
  const { session, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Kalvia Health</div>
        <nav>
          <NavLink to="/providers" className={({ isActive }) => (isActive ? "active" : "")}>
            Find a provider
          </NavLink>
          <NavLink to="/cases" className={({ isActive }) => (isActive ? "active" : "")}>
            My cases
          </NavLink>
          <NavLink to="/appointments" className={({ isActive }) => (isActive ? "active" : "")}>
            Appointments
          </NavLink>
          {session?.role === "provider" && (
            <NavLink to="/providers/setup" className={({ isActive }) => (isActive ? "active" : "")}>
              My profile
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div>{session?.fullName}</div>
          <div style={{ marginBottom: "0.8em" }}>{session?.role}</div>
          <button className="btn-outline btn" onClick={logout} style={{ width: "100%" }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
