import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Case, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import { Chips, SearchField } from "../components/ListTools";
import { usePersisted } from "../lib/usePersisted";

type CaseFilter = "all" | "open" | "in_follow_up" | "closed";

export default function Cases() {
  const { session } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = usePersisted<CaseFilter>("kalvia_f_cases", "all", ["all", "open", "in_follow_up", "closed"]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!session) return;
    api
      .listMyCases(session.token)
      .then(setCases)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load cases"))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p>Loading cases…</p>;

  const count = (st: CaseFilter) => (st === "all" ? cases.length : cases.filter((c) => c.status === st).length);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = cases
    .filter((c) => (filter === "all" || c.status === filter) && words.every((w) => `${c.case_number ?? ""} ${c.reason}`.toLowerCase().includes(w)))
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));

  return (
    <div>
      <h2>My cases</h2>
      {error && <p className="error-text">{error}</p>}

      {session?.role === "patient" && (
        <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
          Each case has its own case number. You'll pick it when you pay a fee.{" "}
          <Link to="/providers">Open a new case</Link>
        </p>
      )}

      {cases.length > 0 && (
        <div className="list-tools">
          <SearchField value={q} onChange={setQ} placeholder="Search by case number or reason…" />
          <Chips
            label="Filter cases by status"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              { id: "open", label: "Open", count: count("open") },
              { id: "in_follow_up", label: "Follow-up", count: count("in_follow_up") },
              { id: "closed", label: "Closed", count: count("closed") },
            ]}
          />
        </div>
      )}

      {cases.length === 0 ? (
        <div className="empty-state">
          No cases yet.{" "}
          {session?.role === "patient" && <Link to="/providers">Find a provider</Link>}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          No cases match.{" "}
          <button type="button" className="link-btn" onClick={() => { setQ(""); setFilter("all"); }}>Show all cases</button>
        </div>
      ) : (
        shown.map((c) => (
          <Link key={c.case_id} to={`/cases/${c.case_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={"list-row" + (c.status === "open" && session?.role === "provider" ? " attn-row" : "")}>
              <div className="list-row-title">
                {c.case_number && <span style={{ fontVariantNumeric: "tabular-nums" }}>{c.case_number} · </span>}
                {c.reason}
              </div>
              <div className="list-row-meta">
                <span className={`status-pill ${c.status}`}>{c.status.replace(/_/g, " ")}</span>
                {" · Opened "}
                {new Date(c.created_at).toLocaleDateString()}
                {" · Updated "}
                {new Date(c.updated_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
