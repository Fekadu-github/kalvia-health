import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Provider, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ProviderDirectory() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openingFor, setOpeningFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    api
      .listProviders(session.token)
      .then(setProviders)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load providers"))
      .finally(() => setLoading(false));
  }, [session]);

  async function submitCase(providerId: string) {
    if (!session || !reason.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.createCase(session.token, { provider_id: providerId, reason });
      navigate(`/cases/${created.case_id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open a case");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading providers…</p>;

  return (
    <div>
      <h2>Find a provider</h2>
      {error && <p className="error-text">{error}</p>}

      {providers.length === 0 ? (
        <div className="empty-state">
          No providers listed yet. If you're a provider, set up your profile from the sidebar.
        </div>
      ) : (
        providers.map((p) => (
          <div key={p.provider_id} className="list-row" style={{ display: "flex", gap: "1em" }}>
            {p.photo_url && (
              <img
                src={p.photo_url}
                alt=""
                style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div className="list-row-title">
                {p.title ? `${p.title} ` : ""}
                {p.full_name}
              </div>
              <div className="list-row-meta" style={{ fontStyle: "italic" }}>
                {p.specialty.replace(/_/g, " ")}
              </div>
              <div className="list-row-meta">
                {p.bio || "No bio provided."} {p.languages ? `· Speaks ${p.languages}` : ""}
                {p.years_experience != null ? ` · ${p.years_experience} yrs experience` : ""}
              </div>
              {p.experience_summary && (
                <div className="list-row-meta" style={{ marginTop: "0.3em" }}>
                  {p.experience_summary}
                </div>
              )}

              {session?.role === "patient" && (
                <div style={{ marginTop: "0.7em" }}>
                  {openingFor === p.provider_id ? (
                    <div>
                      <textarea
                        placeholder="Briefly describe why you'd like to see this provider"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        style={{ marginBottom: "0.6em" }}
                      />
                      <button
                        className="btn"
                        disabled={submitting || !reason.trim()}
                        onClick={() => submitCase(p.provider_id)}
                      >
                        {submitting ? "Opening…" : "Open case"}
                      </button>{" "}
                      <button className="btn-outline btn" onClick={() => setOpeningFor(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="btn-outline btn" onClick={() => setOpeningFor(p.provider_id)}>
                      Open a case
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
