import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthVisual from "../components/AuthVisual";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [params] = useSearchParams();

  const [identifier, setIdentifier] = useState(params.get("identifier") || "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.confirmPasswordReset({ identifier, code, new_password: newPassword });
      login({ token: res.access_token, userId: res.user_id, role: res.role, fullName: res.full_name, title: res.title });
      navigate(res.role === "provider" ? "/providers/setup" : "/providers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work — check it and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <AuthVisual />
      <div className="auth-form-panel">
        <div className="auth-card">
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.2em" }}>Enter your reset code.</p>
          <hr className="hairline" />

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="identifier">Email, phone number, or username</label>
              <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                inputMode="numeric"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>

          <p className="auth-switch">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
