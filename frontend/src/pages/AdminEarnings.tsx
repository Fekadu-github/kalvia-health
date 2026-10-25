import { useEffect, useState } from "react";
import { api, ApiError, AdminEarnings as Data, ProviderEarnings } from "../api";
import { useAuth } from "../context/AuthContext";
import { money, currentMonth, TYPE_LABEL } from "../lib/money";

function TypeTable({ rows }: { rows: { type: string; count: number; total: number }[] }) {
  if (!rows.length) return <p className="list-row-meta">No fees this month.</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type}>
            <td>{TYPE_LABEL[r.type] ?? r.type}</td>
            <td>{r.count} ×</td>
            <td style={{ textAlign: "right" }}>{money(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProviderCard({ p, month, onChanged }: { p: ProviderEarnings; month: string; onChanged: () => void }) {
  const { session } = useAuth();
  const [percent, setPercent] = useState(p.share_percent?.toString() ?? "");
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const pct = parseFloat(percent);
  const preview = isNaN(pct) ? null : Math.round(p.gross * pct) / 100;

  async function run(fn: () => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="list-row">
      <div className="list-row-title">{p.full_name} <span className="list-row-meta">· {p.specialty}</span></div>
      <div className="list-row-meta">
        Cases opened {p.cases_opened} · cases worked {p.cases_worked} · tasks {p.tasks_count} · gross fees <b>{money(p.gross)}</b>
      </div>
      <TypeTable rows={p.by_type} />
      {p.completed_consultations.length > 0 && (
        <div className="list-row-meta">
          Completed consultations: {p.completed_consultations.map((c) => `${TYPE_LABEL[c.type] ?? c.type} ${c.count}`).join(", ")}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.6em", flexWrap: "wrap", alignItems: "flex-end", marginTop: "0.8em" }}>
        <div className="field" style={{ marginBottom: 0, width: 110 }}>
          <label>Share %</label>
          <input type="number" min={0} max={100} step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div><b>Provider gets: {money(preview)}</b></div>
      </div>

      <div style={{ marginTop: "0.6em", display: "flex", gap: "0.6em", flexWrap: "wrap" }}>
        <button className="btn-outline btn" disabled={busy || isNaN(pct)} onClick={() => run(() => api.adminSetShare(session!.token, p.provider_id, month, pct, note || undefined))}>
          Save %
        </button>
        <button
          className="btn"
          disabled={busy || p.share_percent == null || p.share_percent !== pct}
          title={p.share_percent !== pct ? "Save the % first" : ""}
          onClick={() => run(() => api.adminNotifyProvider(session!.token, p.provider_id, month))}
        >
          {p.notified_at ? "Re-notify provider" : "Notify provider"}
        </button>
        <button className="btn-outline btn" onClick={() => setOpen(!open)}>{open ? "Hide tasks" : `Tasks (${p.tasks_count})`}</button>
      </div>
      {p.notified_at && (
        <div className="list-row-meta">Notified {new Date(p.notified_at).toLocaleString()} — {money(p.notified_amount)}</div>
      )}
      {err && <p className="error-text">{err}</p>}

      {open && (
        <table style={{ width: "100%", marginTop: "0.6em", fontSize: "0.9em" }}>
          <tbody>
            {p.tasks.map((t) => (
              <tr key={t.payment_id}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>{TYPE_LABEL[t.type] ?? t.type}</td>
                <td>{t.case_number ?? t.case_id}</td>
                <td style={{ textAlign: "right" }}>{money(t.amount)}</td>
                <td style={{ textAlign: "right" }}>{money(t.share_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminEarnings() {
  const { session } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!session) return;
    api.adminEarnings(session.token, month).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load earnings"));
  }
  useEffect(load, [session, month]);

  return (
    <div style={{ maxWidth: 860 }}>
      <h2>Earnings & provider shares</h2>
      {error && <p className="error-text">{error}</p>}
      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="m">Month</label>
        <input id="m" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {!data ? <p>Loading…</p> : (
        <>
          <div className="list-row">
            <div className="list-row-title">Overall — {data.month}</div>
            <div className="list-row-meta">
              Cases opened <b>{data.cases_opened}</b> · total received <b>{money(data.total_received)}</b> ·
              provider shares <b>{money(data.total_provider_shares)}</b> · platform net <b>{money(data.platform_net)}</b>
            </div>
            <h4>Fees received by type</h4>
            <TypeTable rows={data.received_by_type} />
            {data.completed_consultations.length > 0 && (
              <div className="list-row-meta">
                Completed consultations: {data.completed_consultations.map((c) => `${TYPE_LABEL[c.type] ?? c.type} ${c.count}`).join(", ")}
              </div>
            )}
          </div>
          <h3>Providers</h3>
          {data.providers.length === 0 ? <div className="empty-state">No providers yet.</div> :
            data.providers.map((p) => <ProviderCard key={p.provider_id + month + (p.share_percent ?? "")} p={p} month={month} onChanged={load} />)}
        </>
      )}
    </div>
  );
}
