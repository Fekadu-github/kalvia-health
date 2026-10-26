import { useEffect, useState } from "react";
import { api, ApiError, AdminEarnings as Data, ProviderEarnings, ShareLine } from "../api";
import { useAuth } from "../context/AuthContext";
import { money, currentMonth, TYPE_LABEL, feeLabel } from "../lib/money";

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

type Run = (fn: (token: string) => Promise<unknown>) => void;

// One calculation line. rule === null means a new, not-yet-saved line.
function LineRow({ l, providerId, feeTypes, usedTypes, busy, run, onCancel }: {
  l: ShareLine | null; providerId: string; feeTypes: string[]; usedTypes: string[];
  busy: boolean; run: Run; onCancel?: () => void;
}) {
  const [type, setType] = useState(l?.type ?? "");
  const [val, setVal] = useState(l?.percent?.toString() ?? "");
  const n = parseFloat(val);
  const valid = !isNaN(n) && n >= 0 && n <= 100;
  const options = feeTypes.filter((t) => t === l?.type || !usedTypes.includes(t));
  const fees = l?.fees ?? 0;
  const preview = valid ? Math.round(fees * n) / 100 : 0;
  const dirty = l ? type !== l.type || n !== l.percent : true;
  return (
    <tr>
      <td>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {!l && <option value="">Select fee…</option>}
          {options.map((t) => <option key={t} value={t}>{feeLabel(t)}</option>)}
        </select>
      </td>
      <td>{l?.count ?? "—"}</td>
      <td style={{ textAlign: "right" }}>{l ? money(l.fees) : "—"}</td>
      <td style={{ width: 90 }}>
        <input type="number" min={0} max={100} step="0.01" placeholder="%" value={val} onChange={(e) => setVal(e.target.value)} />
      </td>
      <td style={{ textAlign: "right" }}>{l ? money(preview) : "—"}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        {l ? (
          <>
            <button className="btn btn-outline" disabled={busy || !valid || !dirty} onClick={() => run((t) => api.adminEditRule(t, l.rule_id!, n, type))}>Save</button>{" "}
            <button className="btn btn-outline" disabled={busy} onClick={() => run((t) => api.adminDeleteRule(t, l.rule_id!))}>Delete</button>
          </>
        ) : (
          <>
            <button className="btn btn-outline" disabled={busy || !valid || !type} onClick={() => run(async (t) => { await api.adminAddRule(t, providerId, type, n); onCancel?.(); })}>Add</button>{" "}
            <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          </>
        )}
      </td>
    </tr>
  );
}

function ProviderCard({ p, month, feeTypes, onChanged }: { p: ProviderEarnings; month: string; feeTypes: string[]; onChanged: () => void }) {
  const { session } = useAuth();
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const used = p.lines.map((l) => l.type);

  async function run(fn: (token: string) => Promise<unknown>) {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await fn(session.token);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const total = p.share_total ?? 0;
  const changedSinceNotify = p.notified_at && p.notified_amount !== total;

  return (
    <div className="list-row">
      <div className="list-row-title">{p.full_name} <span className="list-row-meta">· {p.specialty}</span></div>
      <div className="list-row-meta">
        Cases opened {p.cases_opened} · cases worked {p.cases_worked} · tasks {p.tasks_count} · gross fees <b>{money(p.gross)}</b>
      </div>
      {p.completed_consultations.length > 0 && (
        <div className="list-row-meta">
          Completed consultations: {p.completed_consultations.map((c) => `${TYPE_LABEL[c.type] ?? c.type} ${c.count}`).join(", ")}
        </div>
      )}

      <h4 style={{ marginBottom: 4 }}>Share calculation</h4>
      <p className="list-row-meta" style={{ marginTop: 0 }}>Registration fees are never shared. Add a line for each fee type the provider shares in.</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th align="left">Fee type</th><th align="left">Tasks</th><th align="right">Fees</th><th align="left">Share %</th><th align="right">Provider share</th><th /></tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <LineRow key={l.rule_id! + l.type + l.percent} l={l} providerId={p.provider_id} feeTypes={feeTypes} usedTypes={used} busy={busy} run={run} />
          ))}
          {adding && <LineRow l={null} providerId={p.provider_id} feeTypes={feeTypes} usedTypes={used} busy={busy} run={run} onCancel={() => setAdding(false)} />}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}><b>Sum</b></td>
            <td style={{ textAlign: "right" }}><b>{money(p.shared_fees)}</b></td>
            <td />
            <td style={{ textAlign: "right" }}><b>{money(total)}</b></td>
            <td />
          </tr>
        </tfoot>
      </table>
      {!adding && used.length < feeTypes.length && (
        <button className="btn btn-outline" style={{ marginTop: "0.5em" }} onClick={() => setAdding(true)}>+ Add line</button>
      )}
      <div className="list-row-meta">
        Gross fees {money(p.gross)} · shared fees {money(p.shared_fees)} · kept by platform {money(Math.round((p.gross - total) * 100) / 100)}. Lines stay in force every month until you change them.
      </div>

      <div className="field" style={{ marginTop: "0.6em" }}>
        <label>Note to provider (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (p.note ?? "") && run((t) => api.adminSetNote(t, p.provider_id, month, note))} />
      </div>

      <div style={{ display: "flex", gap: "0.6em", flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={() => run((t) => api.adminNotifyProvider(t, p.provider_id, month))}>
          {p.notified_at ? "Re-notify" : "Notify provider"} · {money(total)}
        </button>
        <button className="btn btn-outline" onClick={() => setOpen(!open)}>{open ? "Hide tasks" : `Tasks (${p.tasks_count})`}</button>
      </div>
      {p.notified_at && (
        <div className="list-row-meta">
          Notified {new Date(p.notified_at).toLocaleString()} — {money(p.notified_amount)}
          {changedSinceNotify && <b> · the current total differs, re-notify to update the provider</b>}
        </div>
      )}
      {err && <p className="error-text">{err}</p>}

      {open && (
        <table style={{ width: "100%", marginTop: "0.6em", fontSize: "0.9em" }}>
          <tbody>
            {p.tasks.map((t) => (
              <tr key={t.payment_id}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>{feeLabel(t.type)}</td>
                <td>{t.case_number ?? t.case_id}</td>
                <td style={{ textAlign: "right" }}>{money(t.amount)}</td>
                <td style={{ textAlign: "right" }}>{t.share_percent == null ? "not shared" : `${t.share_percent}% = ${money(t.share_amount)}`}</td>
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
              Cases opened <b>{data.cases_opened}</b> · cases with fees <b>{data.cases_with_fees}</b> · total received <b>{money(data.total_received)}</b> ·
              provider shares <b>{money(data.total_provider_shares)}</b> · platform net <b>{money(data.platform_net)}</b>
            </div>
            <h4>Fees received by type</h4>
            <TypeTable rows={data.received_by_type} />
            <h4>All fees received</h4>
            {data.fees.length === 0 ? <p className="list-row-meta">No approved fees this month.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.9em" }}>
                  <thead><tr><th align="left">Date</th><th align="left">Fee</th><th align="left">Case</th><th align="left">Provider</th><th align="right">Amount</th></tr></thead>
                  <tbody>
                    {data.fees.map((f) => (
                      <tr key={f.payment_id}>
                        <td>{f.date ? new Date(f.date).toLocaleDateString() : "—"}</td>
                        <td>{feeLabel(f.type)}</td>
                        <td>{f.case_number ?? (f.type === "registration" ? "—" : "no case yet")}</td>
                        <td>{f.provider_name ?? "—"}</td>
                        <td align="right">{money(f.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.completed_consultations.length > 0 && (
              <div className="list-row-meta">
                Completed consultations: {data.completed_consultations.map((c) => `${TYPE_LABEL[c.type] ?? c.type} ${c.count}`).join(", ")}
              </div>
            )}
          </div>
          <h3>Providers</h3>
          {data.providers.length === 0 ? <div className="empty-state">No providers yet.</div> :
            data.providers.map((p) => <ProviderCard feeTypes={data.fee_types} key={p.provider_id + month + p.lines.map((l) => l.percent ?? "-").join("|")} p={p} month={month} onChanged={load} />)}
        </>
      )}
    </div>
  );
}
