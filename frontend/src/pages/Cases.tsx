import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Case, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Cases() {
  const { session } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api
      .listMyCases(session.token)
      .then(setCases)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load cases"))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p>Loading cases…</p>;

  return (
    <div>
      <h2>My cases</h2>
      {error && <p className="error-text">{error}</p>}

      {cases.length === 0 ? (
        <div className="empty-state">
          No cases yet.{" "}
          {session?.role === "patient" && <Link to="/providers">Find a provider</Link>}
        </div>
      ) : (
        cases.map((c) => (
          <Link key={c.case_id} to={`/cases/${c.case_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="list-row">
              <div className="list-row-title">{c.reason}</div>
              <div className="list-row-meta">
                <span className={`status-pill ${c.status}`}>{c.status.replace(/_/g, " ")}</span>
                {" · Opened "}
                {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
