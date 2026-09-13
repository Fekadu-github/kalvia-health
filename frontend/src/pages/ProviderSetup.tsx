import { useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ProviderSetup() {
  const { session } = useAuth();
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await api.createMyProviderProfile(session.token, { specialty, bio, languages });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div>
        <h2>Profile saved</h2>
        <p style={{ color: "var(--ink-soft)" }}>
          Patients can now find you in the provider directory.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2>Set up your provider profile</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="specialty">Specialty</label>
          <input
            id="specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="e.g. internal_medicine"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="bio">Short bio</label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </div>
        <div className="field">
          <label htmlFor="languages">Languages spoken</label>
          <input
            id="languages"
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            placeholder="e.g. Amharic, English"
          />
        </div>
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
