import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"patient" | "provider">("patient");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.devLogin({
        username,
        full_name: fullName,
        role,
        external_idp_subject: username, // fine for local dev-login; real OIDC replaces this later
      });
      login({ token: res.access_token, userId: res.user_id, role: res.role, fullName });
      navigate(role === "provider" ? "/providers/setup" : "/providers");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not reach the server. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Kalvia Health</h1>
        <p style={{ color: "var(--ink-soft)", marginTop: "-0.6em" }}>
          Sign in to continue.
        </p>
        <hr className="hairline" />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. selam_k"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Selam Kebede"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="role">I am a</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as "patient" | "provider")}>
              <option value="patient">Patient</option>
              <option value="provider">Provider</option>
            </select>
          </div>
          <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Signing in..." : "Continue"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>
    </div>
  );
}
