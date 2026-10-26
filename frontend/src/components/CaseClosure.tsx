import { useState } from "react";
import { api, ApiError, Case } from "../api";
import { useAuth } from "../context/AuthContext";

/** Closing a case: the provider requests it, the admin approves it. */
export default function CaseClosure({ theCase, onChanged }: { theCase: Case; onChanged: () => void }) {
  const { session } = useAuth();
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isProvider = session?.role === "provider";

  async function run(fn: (token: string) => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await fn(session.token);
      setSummary("");
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (theCase.status === "closed") {
    return (
      <div className="list-row-meta">
        Case closed{theCase.closed_at ? ` on ${new Date(theCase.closed_at).toLocaleDateString()}` : ""}.
        {theCase.closure_admin_note && <> Patient status: {theCase.closure_admin_note}</>}
      </div>
    );
  }

  if (theCase.closure_status === "requested") {
    return (
      <div className="list-row-meta">
        <b>Closure requested — waiting for admin approval.</b>
        {theCase.closure_summary && <div>Summary: {theCase.closure_summary}</div>}
        {isProvider && (
          <button className="btn btn-outline" disabled={busy} onClick={() => run((t) => api.withdrawCaseClosure(t, theCase.case_id))}>Withdraw request</button>
        )}
        {err && <p className="error-text">{err}</p>}
      </div>
    );
  }

  if (!isProvider) return null;

  return (
    <div style={{ marginTop: "0.8em" }}>
      {theCase.closure_status === "rejected" && (
        <p className="error-text">The admin did not approve closing this case: {theCase.closure_admin_note}</p>
      )}
      <div className="field">
        <label>Close this case — closing summary</label>
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Consultation and prescription done; patient outcome, follow-up advice…" />
      </div>
      <button className="btn" disabled={busy || !summary.trim()} onClick={() => run((t) => api.requestCaseClosure(t, theCase.case_id, summary))}>
        Request case closure
      </button>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
