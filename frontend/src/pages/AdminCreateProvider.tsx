import { useState } from "react";
import { api, ApiError, ProviderAccount } from "../api";
import { useAuth } from "../context/AuthContext";

export default function AdminCreateProvider() {
  const { session } = useAuth();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ProviderAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const account = await api.createProviderAccount(session.token, {
        username,
        full_name: fullName,
        password,
        specialty,
        bio: bio || undefined,
        languages: languages || undefined,
      });
      setCreated(account);
      setUsername("");
      setFullName("");
      setPassword("");
      setSpecialty("");
      setBio("");
      setLanguages("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the provider account");
    } finally {
      setSubmitting(false);
    }
  }

  if (session?.role !== "admin") {
    return <div className="empty-state">Only an admin account can access this page.</div>;
  }

  return (
    <div>
      <h2>Create a provider account</h2>
      <p style={{ color: "var(--ink-soft)" }}>
        Providers don't self-register — issue their username and password here, then hand the credentials to them
        directly.
      </p>

      {created && (
        <div className="inline-form" style={{ borderColor: "var(--primary)" }}>
          <strong>Account created for {created.full_name}</strong>
          <p style={{ marginBottom: 0 }}>
            Username: <code>{created.username}</code> — share this and the password you just set with the provider.
          </p>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
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
        <div className="form-row">
          <div className="field">
            <label htmlFor="specialty">Specialty</label>
            <input id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="languages">Languages</label>
            <input
              id="languages"
              placeholder="e.g. English, Amharic"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create provider account"}
        </button>
      </form>
    </div>
  );
}
