import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

type Mode = "patient-login" | "patient-signup" | "provider-login" | "admin-bootstrap";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("patient-login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Patient fields
  const [identifier, setIdentifier] = useState(""); // email or phone, for login
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Provider fields
  const [providerUsername, setProviderUsername] = useState("");
  const [providerPassword, setProviderPassword] = useState("");

  // Admin bootstrap fields (dev-mode only)
  const [adminUsername, setAdminUsername] = useState("");
  const [adminFullName, setAdminFullName] = useState("");

  function afterLogin(res: { access_token: string; user_id: string; role: string }, name: string) {
    login({ token: res.access_token, userId: res.user_id, role: res.role, fullName: name });
    navigate(res.role === "provider" ? "/providers/setup" : "/providers");
  }

  async function handlePatientLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.patientLogin({ identifier, password });
      afterLogin(res, identifier);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function handlePatientSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email && !phone) {
      setError("Enter an email or a phone number.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.patientSignup({
        full_name: fullName,
        password,
        email: email || undefined,
        phone_number: phone || undefined,
      });
      afterLogin(res, fullName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.providerLogin({ username: providerUsername, password: providerPassword });
      afterLogin(res, providerUsername);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.devLogin({
        username: adminUsername,
        full_name: adminFullName,
        role: "admin",
        external_idp_subject: adminUsername,
      });
      login({ token: res.access_token, userId: res.user_id, role: res.role, fullName: adminFullName });
      navigate("/admin/providers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Kalvia Health</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "-0.6em" }}>
          {mode === "provider-login" ? "Provider sign in." : "Sign in to continue."}
        </p>

        <div className="mode-tabs">
          <button
            type="button"
            className={mode !== "provider-login" ? "mode-tab active" : "mode-tab"}
            onClick={() => switchMode("patient-login")}
          >
            Patient
          </button>
          <button
            type="button"
            className={mode === "provider-login" ? "mode-tab active" : "mode-tab"}
            onClick={() => switchMode("provider-login")}
          >
            Provider
          </button>
        </div>

        <hr className="hairline" />

        {mode === "patient-login" && (
          <form onSubmit={handlePatientLogin}>
            <div className="field">
              <label htmlFor="identifier">Email or phone number</label>
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Signing in…" : "Log in"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-switch">
              New here?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("patient-signup")}>
                Create an account
              </button>
            </p>
          </form>
        )}

        {mode === "patient-signup" && (
          <form onSubmit={handlePatientSignup}>
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +251912345678" />
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: "-0.6em" }}>
              Provide at least one of email or phone.
            </p>
            <div className="field">
              <label htmlFor="newPassword">Password</label>
              <input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Creating account…" : "Sign up"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-switch">
              Already have an account?{" "}
              <button type="button" className="link-btn" onClick={() => switchMode("patient-login")}>
                Log in
              </button>
            </p>
          </form>
        )}

        {mode === "provider-login" && (
          <form onSubmit={handleProviderLogin}>
            <div className="field">
              <label htmlFor="providerUsername">Username</label>
              <input
                id="providerUsername"
                value={providerUsername}
                onChange={(e) => setProviderUsername(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="providerPassword">Password</label>
              <input
                id="providerPassword"
                type="password"
                value={providerPassword}
                onChange={(e) => setProviderPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Signing in…" : "Log in"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-switch">Provider accounts are issued by an administrator.</p>
          </form>
        )}

        {mode === "admin-bootstrap" && (
          <form onSubmit={handleAdminBootstrap}>
            <div className="field">
              <label htmlFor="adminUsername">Admin username</label>
              <input id="adminUsername" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="adminFullName">Full name</label>
              <input id="adminFullName" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Signing in…" : "Enter admin console"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-switch">Dev-mode bootstrap access — used once to create provider accounts.</p>
          </form>
        )}

        {mode !== "admin-bootstrap" && (
          <p className="auth-switch">
            <button type="button" className="link-btn" onClick={() => switchMode("admin-bootstrap")}>
              Admin access
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
