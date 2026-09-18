import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthVisual from "../components/AuthVisual";

export default function AdminBootstrap() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.adminBootstrap({
        bootstrap_secret: bootstrapSecret,
        username,
        full_name: fullName,
        password,
      });
      login({ token: res.access_token, userId: res.user_id, role: res.role, fullName: res.full_name, title: res.title });
      navigate("/admin/providers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <AuthVisual />
      <div className="auth-form-panel">
        <div className="auth-card">
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.2em" }}>One-time admin setup.</p>
          <hr className="hairline" />
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="bootstrapSecret">Bootstrap secret</label>
              <input
                id="bootstrapSecret"
                type="password"
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="username">Admin username</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Creating…" : "Create admin account"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-switch">
              This only works once — it refuses as soon as one admin account exists, even with the correct secret.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
