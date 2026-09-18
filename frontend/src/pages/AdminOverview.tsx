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
