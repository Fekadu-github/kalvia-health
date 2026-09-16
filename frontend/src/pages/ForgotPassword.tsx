import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import AuthVisual from "../components/AuthVisual";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestPasswordReset(identifier);
      setSent(true);
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
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.2em" }}>Reset your password.</p>
          <hr className="hairline" />

          {sent ? (
            <>
              <p>
                If an account matches <strong>{identifier}</strong>, a 6-digit code has been sent to it. Enter it on
                the next screen along with a new password.
              </p>
              <button
                type="button"
                className="btn"
                style={{ width: "100%" }}
                onClick={() => navigate(`/reset-password?identifier=${encodeURIComponent(identifier)}`)}
              >
                I have the code
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="identifier">Email, phone number, or username</label>
                <input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button type="submit" className="btn" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending…" : "Send reset code"}
              </button>
              {error && <p className="error-text">{error}</p>}
            </form>
          )}

          <p className="auth-switch">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
