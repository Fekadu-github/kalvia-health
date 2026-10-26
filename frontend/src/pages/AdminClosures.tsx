import { useEffect, useState } from "react";
import { api, ApiError, ClosureItem } from "../api";
import { useAuth } from "../context/AuthContext";

function Row({ c, busy, run }: { c: ClosureItem; busy: boolean; run: (fn: (t: string) => Promise<unknown>) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="list-row">
      <div className="list-row-title">{c.case_number ?? c.case_id} <span className="list-row-meta">· {c.provider_name ?? "provider"}</span></div>
      <div className="list-row-meta">Reason: {c.reason}</div>
      <div className="list-row-meta">
        Opened {c.opened_at ? new Date(c.opened_at).toLocaleDateString() : "—"} · closure requested {c.closure_requested_at ? new Date(c.closure_requested_at).toLocaleString() : "—"}
      </div>
      <div><b>Provider summary:</b> {c.closure_summary}</div>
      <div className="field" style={{ marginTop: "0.6em" }}>
        <label>Patient status you confirmed (needed to approve) / reason (needed to send back)</label>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: "0.6em" }}>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => run((t) => api.adminApproveClosure(t, c.case_id, text))}>Approve &amp; close case</button>
        <button className="btn btn-outline" disabled={busy || !text.trim()} onClick={() => run((t) => api.adminRejectClosure(t, c.case_id, text))}>Send back</button>
      </div>
    </div>
  );
}

export default function AdminClosures() {
  const { session } = useAuth();
  const [items, setItems] = useState<ClosureItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!session) return;
    api.adminListClosures(session.token).then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load"));
  }
  useEffect(load, [session]);

  async function run(fn: (t: string) => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await fn(session.token);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2>Case closures</h2>
      {error && <p className="error-text">{error}</p>}
      {!items ? <p>Loading…</p> : items.length === 0 ? <div className="empty-state">No closure requests waiting.</div> :
        items.map((c) => <Row key={c.case_id} c={c} busy={busy} run={run} />)}
    </div>
  );
}
