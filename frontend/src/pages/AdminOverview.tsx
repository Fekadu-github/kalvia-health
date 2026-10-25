import { useEffect, useState } from "react";
import { api, AdminProviderOverview, AdminSummary, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

const APPROVAL_LABEL: Record<string, string> = {
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function AdminOverview() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [providers, setProviders] = useState<AdminProviderOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLanguages, setEditLanguages] = useState("");
  const [editLicenseNumber, setEditLicenseNumber] = useState("");
  const [editYearsExperience, setEditYearsExperience] = useState("");
  const [editExperienceSummary, setEditExperienceSummary] = useState("");
  const [editAccepting, setEditAccepting] = useState(true);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    if (!session) return;
    setLoading(true);
    Promise.all([api.getAdminSummary(session.token), api.getAdminProvidersOverview(session.token)])
      .then(([s, p]) => {
        setSummary(s);
        setProviders(p);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the admin overview"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [session]);

  function toggle(providerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  async function approve(providerId: string) {
    if (!session) return;
    setBusyProviderId(providerId);
    try {
      await api.approveProvider(session.token, providerId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not approve this provider");
    } finally {
      setBusyProviderId(null);
    }
  }

  async function reject(providerId: string) {
    if (!session) return;
    setBusyProviderId(providerId);
    try {
      await api.rejectProvider(session.token, providerId, rejectReason || undefined);
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reject this provider");
    } finally {
      setBusyProviderId(null);
    }
  }

  function startEdit(po: AdminProviderOverview) {
    setEditingId(po.provider.provider_id);
    setEditFullName(po.user.full_name);
    setEditTitle(po.user.title || "");
    setEditSpecialty(po.provider.specialty);
    setEditBio(po.provider.bio || "");
    setEditLanguages(po.provider.languages || "");
    setEditLicenseNumber(po.provider.license_number || "");
    setEditYearsExperience(po.provider.years_experience != null ? String(po.provider.years_experience) : "");
    setEditExperienceSummary(po.provider.experience_summary || "");
    setEditAccepting(po.provider.accepting_new_cases === "true");
  }

  async function saveEdit(providerId: string) {
    if (!session) return;
    setBusyProviderId(providerId);
    try {
      await api.adminUpdateProvider(session.token, providerId, {
        full_name: editFullName,
        title: editTitle || undefined,
        specialty: editSpecialty,
        bio: editBio || undefined,
        languages: editLanguages || undefined,
        license_number: editLicenseNumber || undefined,
        years_experience: editYearsExperience ? Number(editYearsExperience) : undefined,
        experience_summary: editExperienceSummary || undefined,
        accepting_new_cases: editAccepting,
      });
      setEditingId(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save these changes");
    } finally {
      setBusyProviderId(null);
    }
  }

  async function deleteProvider(providerId: string) {
    if (!session) return;
    setBusyProviderId(providerId);
    try {
      await api.adminDeleteProvider(session.token, providerId);
      setDeletingId(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete this provider");
    } finally {
      setBusyProviderId(null);
    }
  }

  if (session?.role !== "admin") {
    return <div className="empty-state">Only an admin account can access this page.</div>;
  }

  if (loading) return <p>Loading overview…</p>;

  return (
    <div>
      <h2>Overview</h2>
      {error && <p className="error-text">{error}</p>}

      {summary && (
        <div className="form-row" style={{ flexWrap: "wrap", marginBottom: "1.5em" }}>
          {[
            ["Providers", summary.total_providers],
            ["Patients", summary.total_patients],
            ["Cases", summary.total_cases],
            ["Appointments", summary.total_appointments],
            ["Pending approval", summary.providers_pending_approval],
          ].map(([label, value]) => (
            <div key={label as string} className="inline-form" style={{ flex: "1 1 140px", marginBottom: "1em" }}>
              <div style={{ fontSize: "1.6rem", fontWeight: 600, color: "var(--primary)" }}>{value}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <h3>Providers</h3>
      {providers.length === 0 ? (
        <div className="empty-state">No providers yet.</div>
      ) : (
        providers.map((po) => {
          const isOpen = expanded.has(po.provider.provider_id);
          const status = po.provider.approval_status || "pending";
          return (
            <div key={po.provider.provider_id} className="list-row">
              <div
                className="section-header"
                style={{ cursor: "pointer" }}
                onClick={() => toggle(po.provider.provider_id)}
              >
                <div style={{ display: "flex", gap: "0.9em", alignItems: "flex-start" }}>
                  {po.provider.photo_url && (
                    <img
                      src={po.provider.photo_url}
                      alt=""
                      style={{ width: 45, height: 60, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <div className="list-row-title">
                      {po.user.title ? `${po.user.title} ` : ""}
                      {po.user.full_name} · {po.provider.specialty.replace(/_/g, " ")}
                    </div>
                    <div className="list-row-meta">
                      {po.patient_count} patient{po.patient_count === 1 ? "" : "s"} · {po.case_count} case
                      {po.case_count === 1 ? "" : "s"}
                      {po.user.email ? ` · ${po.user.email}` : ""}
                    </div>
                  </div>
                </div>
                <span className={`status-pill ${status === "approved" ? "confirmed" : status === "rejected" ? "cancelled" : "requested"}`}>
                  {APPROVAL_LABEL[status]}
                </span>
              </div>

              {status !== "approved" && (
                <div className="row-actions">
                  <button
                    className="btn"
                    disabled={busyProviderId === po.provider.provider_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      approve(po.provider.provider_id);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-outline btn"
                    disabled={busyProviderId === po.provider.provider_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectingId(rejectingId === po.provider.provider_id ? null : po.provider.provider_id);
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}

              <div className="row-actions">
                <button
                  className="btn-outline btn"
                  disabled={busyProviderId === po.provider.provider_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(null);
                    editingId === po.provider.provider_id ? setEditingId(null) : startEdit(po);
                  }}
                >
                  {editingId === po.provider.provider_id ? "Cancel edit" : "Edit"}
                </button>
                <button
                  className="btn-outline btn"
                  disabled={busyProviderId === po.provider.provider_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                    setDeletingId(deletingId === po.provider.provider_id ? null : po.provider.provider_id);
                  }}
                >
                  Delete
                </button>
              </div>

              {deletingId === po.provider.provider_id && (
                <div className="inline-form" style={{ marginTop: "0.6em", borderColor: "var(--danger, #c0392b)" }}>
                  <p style={{ marginTop: 0 }}>
                    Permanently delete {po.user.title ? `${po.user.title} ` : ""}
                    {po.user.full_name}'s account? This can't be undone.
                    {po.case_count > 0 &&
                      " This provider has existing cases, so deletion will be blocked — reject or turn off " +
                        "'accepting new cases' instead."}
                  </p>
                  <button
                    className="btn"
                    disabled={busyProviderId === po.provider.provider_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProvider(po.provider.provider_id);
                    }}
                  >
                    Confirm delete
                  </button>
                </div>
              )}

              {editingId === po.provider.provider_id && (
                <div className="inline-form" style={{ marginTop: "0.6em" }} onClick={(e) => e.stopPropagation()}>
                  <div className="form-row">
                    <div className="field">
                      <label>Full name</label>
                      <input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Title (optional)</label>
                      <input
                        placeholder="e.g. Dr., Prof."
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{ maxWidth: "10em" }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Specialty</label>
                      <input value={editSpecialty} onChange={(e) => setEditSpecialty(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Languages</label>
                      <input value={editLanguages} onChange={(e) => setEditLanguages(e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Bio</label>
                    <textarea rows={2} value={editBio} onChange={(e) => setEditBio(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>License number</label>
                      <input value={editLicenseNumber} onChange={(e) => setEditLicenseNumber(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Years of experience</label>
                      <input
                        type="number"
                        min={0}
                        max={80}
                        value={editYearsExperience}
                        onChange={(e) => setEditYearsExperience(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Experience summary (shown to patients)</label>
                    <textarea
                      rows={2}
                      value={editExperienceSummary}
                      onChange={(e) => setEditExperienceSummary(e.target.value)}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.8em" }}>
                    <input
                      type="checkbox"
                      checked={editAccepting}
                      onChange={(e) => setEditAccepting(e.target.checked)}
                    />
                    Accepting new cases
                  </label>
                  <button
                    className="btn"
                    disabled={busyProviderId === po.provider.provider_id}
                    onClick={() => saveEdit(po.provider.provider_id)}
                  >
                    {busyProviderId === po.provider.provider_id ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}

              {rejectingId === po.provider.provider_id && (
                <div style={{ marginTop: "0.6em" }}>
                  <textarea
                    placeholder="Optional note explaining what needs to change"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    style={{ marginBottom: "0.5em" }}
                  />
                  <button className="btn" disabled={busyProviderId === po.provider.provider_id} onClick={() => reject(po.provider.provider_id)}>
                    Confirm rejection
                  </button>
                </div>
              )}

              {isOpen && (
                <div style={{ marginTop: "1em" }}>
                  {po.provider.license_number && (
                    <div className="list-row-meta" style={{ marginBottom: "0.8em" }}>
                      License: {po.provider.license_number}
                      {po.provider.years_experience != null ? ` · ${po.provider.years_experience} yrs experience` : ""}
                    </div>
                  )}
                  {po.cases.length === 0 ? (
                    <div className="empty-state">No cases for this provider yet.</div>
                  ) : (
                    po.cases.map((c) => (
                      <div key={c.case_id} className="note">
                        <div className="note-meta">
                          <strong>{c.patient.full_name}</strong> · <span className={`status-pill ${c.status}`}>{c.status.replace(/_/g, " ")}</span>
                          {" · Opened "}
                          {new Date(c.created_at).toLocaleDateString()}
                        </div>
                        <div style={{ marginBottom: "0.5em" }}>{c.reason}</div>
                        {c.appointments.length > 0 && (
                          <div style={{ paddingLeft: "1em" }}>
                            {c.appointments.map((a) => (
                              <div key={a.appointment_id} className="list-row-meta">
                                {formatDateTime(a.scheduled_at)} · {a.consultation_type} ·{" "}
                                <span className={`status-pill ${a.status}`}>{a.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
