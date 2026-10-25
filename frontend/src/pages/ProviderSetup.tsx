import { useEffect, useRef, useState } from "react";
import { api, ApiError, Provider } from "../api";
import { useAuth } from "../context/AuthContext";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending admin approval",
  approved: "Approved — visible to patients",
  rejected: "Changes needed",
};

export default function ProviderSetup() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<Provider | null>(null);

  // Editing starts true only for first-time setup (no profile yet).
  // Once a profile exists, it opens in read-only view; "Edit profile"
  // is what switches it into the form below.
  const [editing, setEditing] = useState(false);

  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [experienceSummary, setExperienceSummary] = useState("");

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFieldsFrom(profile: Provider) {
    setSpecialty(profile.specialty);
    setBio(profile.bio || "");
    setLanguages(profile.languages || "");
    setLicenseNumber(profile.license_number || "");
    setYearsExperience(profile.years_experience != null ? String(profile.years_experience) : "");
    setExperienceSummary(profile.experience_summary || "");
  }

  useEffect(() => {
    if (!session) return;
    api
      .getMyProviderProfile(session.token)
      .then((profile) => {
        setExisting(profile);
        loadFieldsFrom(profile);
        setEditing(false); // profile exists — open in view mode
      })
      .catch((e) => {
        // 404 just means no profile yet — that's the normal "first time" case, not an error.
        if (e instanceof ApiError && e.status === 404) {
          setEditing(true); // no profile yet — go straight to the form
        } else {
          setError(e instanceof ApiError ? e.message : "Could not load your profile");
        }
      })
      .finally(() => setLoading(false));
  }, [session]);

  function handleStartEdit() {
    if (existing) loadFieldsFrom(existing); // discard any stray unsaved edits from before
    setSaved(false);
    setError(null);
    setEditing(true);
  }

  function handleCancelEdit() {
    if (!existing) return; // first-time setup has nothing to cancel back to
    loadFieldsFrom(existing);
    setError(null);
    setEditing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    const payload = {
      specialty,
      bio: bio || undefined,
      languages: languages || undefined,
      license_number: licenseNumber,
      years_experience: yearsExperience ? Number(yearsExperience) : undefined,
      experience_summary: experienceSummary || undefined,
    };
    try {
      const profile = existing
        ? await api.updateMyProviderProfile(session.token, payload)
        : await api.createMyProviderProfile(session.token, payload);
      setExisting(profile);
      setSaved(true);
      setEditing(false); // drop back into view mode once saved
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !session) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const profile = await api.uploadMyProviderPhoto(session.token, file);
      setExisting(profile);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Could not upload that photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemovePhoto() {
    if (!session) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const profile = await api.deleteMyProviderPhoto(session.token);
      setExisting(profile);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Could not remove the photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  if (loading) return <p>Loading your profile…</p>;

  const photoSection = existing && (
    <div className="inline-form">
      <label style={{ marginBottom: "0.6em" }}>Profile photo</label>
      <div style={{ display: "flex", gap: "1.2em", alignItems: "flex-start" }}>
        <div
          style={{
            width: 135,
            height: 180,
            border: "1px solid var(--line)",
            borderRadius: 4,
            overflow: "hidden",
            background: "var(--bg)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {existing.photo_url ? (
            <img
              src={existing.photo_url}
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ color: "var(--ink-soft)", fontSize: "0.78rem", padding: "0 0.5em", textAlign: "center" }}>
              No photo yet
            </span>
          )}
        </div>
        <div>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", marginTop: 0 }}>
            Any photo works — it's automatically cropped to a 3:4 portrait. Visible to you, admins, and
            patients, and you can change it anytime; it doesn't need admin approval.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoSelected}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="btn-outline btn"
            disabled={photoUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {photoUploading ? "Uploading…" : existing.photo_url ? "Replace photo" : "Upload photo"}
          </button>{" "}
          {existing.photo_url && (
            <button type="button" className="btn-outline btn" disabled={photoUploading} onClick={handleRemovePhoto}>
              Remove
            </button>
          )}
          {photoError && <p className="error-text">{photoError}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520 }}>
      <h2>{existing ? "My provider profile" : "Set up your provider profile"}</h2>
      {existing && (
        <p style={{ color: "var(--ink-soft)", marginTop: "-0.6em" }}>
          {session?.title ? `${session.title} ` : ""}
          {session?.fullName}
        </p>
      )}

      {existing && (
        <div className="inline-form">
          <strong>{STATUS_LABEL[existing.approval_status || "pending"]}</strong>
          {existing.approval_status === "rejected" && existing.rejection_reason && (
            <p style={{ marginBottom: "0.8em" }}>Admin note: {existing.rejection_reason}</p>
          )}
          {existing.approval_status !== "rejected" && (
            <p style={{ color: "var(--ink-soft)", marginBottom: "0.8em" }}>
              Patients only see this profile once it's approved. Any edit you make here goes back to admin
              for another look before it's visible again.
            </p>
          )}
        </div>
      )}

      {saved && !editing && (
        <p style={{ color: "var(--primary)" }}>
          Saved — this version is now waiting on admin approval.
        </p>
      )}

      {photoSection}

      {existing && !editing ? (
        // --- Read-only view: shown as soon as a profile exists ---
        <div className="inline-form">
          <div className="field">
            <label>Specialty</label>
            <p style={{ margin: "0.2em 0" }}>{existing.specialty}</p>
          </div>
          <div className="form-row">
            <div className="field">
              <label>License number</label>
              <p style={{ margin: "0.2em 0" }}>{existing.license_number || "—"}</p>
            </div>
            <div className="field">
              <label>Years of experience</label>
              <p style={{ margin: "0.2em 0" }}>{existing.years_experience ?? "—"}</p>
            </div>
          </div>
          <div className="field">
            <label>Experience summary (shown to patients)</label>
            <p style={{ margin: "0.2em 0", whiteSpace: "pre-wrap" }}>{existing.experience_summary || "—"}</p>
          </div>
          <div className="field">
            <label>Short bio</label>
            <p style={{ margin: "0.2em 0", whiteSpace: "pre-wrap" }}>{existing.bio || "—"}</p>
          </div>
          <div className="field">
            <label>Languages spoken</label>
            <p style={{ margin: "0.2em 0" }}>{existing.languages || "—"}</p>
          </div>
          <button type="button" className="btn" onClick={handleStartEdit}>
            Edit profile
          </button>
          {error && <p className="error-text">{error}</p>}
        </div>
      ) : (
        // --- Editable form: first-time setup, or after clicking "Edit profile" ---
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
          <div className="form-row">
            <div className="field">
              <label htmlFor="licenseNumber">License number</label>
              <input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. MD-2024-00913"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="yearsExperience">Years of experience</label>
              <input
                id="yearsExperience"
                type="number"
                min={0}
                max={80}
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="experienceSummary">Experience summary (shown to patients)</label>
            <textarea
              id="experienceSummary"
              value={experienceSummary}
              onChange={(e) => setExperienceSummary(e.target.value)}
              rows={3}
              placeholder="A short summary of your training and experience patients will see on your profile"
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
          <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>
            Your license number is only ever visible to you and to admins — patients see the specialty, bio,
            languages, and experience summary.
          </p>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : existing ? "Save changes" : "Save profile"}
          </button>{" "}
          {existing && (
            <button type="button" className="btn-outline btn" disabled={saving} onClick={handleCancelEdit}>
              Cancel
            </button>
          )}
          {error && <p className="error-text">{error}</p>}
        </form>
      )}
    </div>
  );
}
