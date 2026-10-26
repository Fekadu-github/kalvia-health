import { useState } from "react";
import { api, ApiError, AdminEarnings } from "../api";
import { useAuth } from "../context/AuthContext";
import { money, feeLabel } from "../lib/money";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { label: "This month", start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) },
    { label: "Last month", start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) },
    { label: "This quarter", start: iso(new Date(y, q, 1)), end: iso(new Date(y, q + 3, 0)) },
    { label: "This year", start: iso(new Date(y, 0, 1)), end: iso(new Date(y, 11, 31)) },
  ];
}

export default function AdminReports() {
  const { session } = useAuth();
  const first = presets()[0];
  const [start, setStart] = useState(first.start);
  const [end, setEnd] = useState(first.end);
  const [data, setData] = useState<AdminEarnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(s = start, e = end) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api.adminPeriodReport(session.token, s, e));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Could not create the report");
    } finally {
      setBusy(false);
    }
  }

  async function download(format: "pdf" | "xlsx") {
    if (!session || !data) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDownloadReport(session.token, data.period_start, data.period_end, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  const shareRows = data
    ? data.providers.flatMap((p) =>
        p.lines.length
          ? p.lines.map((l) => ({ key: p.provider_id + l.type, prov: p.full_name, fee: feeLabel(l.type), count: l.count, fees: l.fees, pct: l.percent as number | null, share: l.share }))
          : [{ key: p.provider_id, prov: p.full_name, fee: "No share lines set", count: p.tasks_count, fees: p.gross, pct: null as number | null, share: 0 }]
      )
    : [];

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Fee reports</h2>
      <div style={{ display: "flex", gap: "0.6em", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn" disabled={busy || !start || !end} onClick={() => generate()}>Show report</button>
      </div>
      <div style={{ display: "flex", gap: "0.5em", flexWrap: "wrap", margin: "0.6em 0" }}>
        {presets().map((p) => (
          <button key={p.label} className="btn btn-outline" onClick={() => { setStart(p.start); setEnd(p.end); generate(p.start, p.end); }}>{p.label}</button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <div className="list-row">
            <div className="list-row-title">{data.period_start} to {data.period_end}</div>
            <div className="list-row-meta">
              Cases opened <b>{data.cases_opened}</b> · cases with fees <b>{data.cases_with_fees}</b> · total fees <b>{money(data.total_received)}</b> ·
              provider shares <b>{money(data.total_provider_shares)}</b> · platform net <b>{money(data.platform_net)}</b>
            </div>
            <div style={{ display: "flex", gap: "0.6em", marginTop: "0.5em" }}>
              <button className="btn" disabled={busy} onClick={() => download("pdf")}>Download PDF</button>
              <button className="btn" disabled={busy} onClick={() => download("xlsx")}>Download Excel</button>
            </div>
          </div>

          <h3>Fees received by type</h3>
          <table style={{ width: "100%" }}>
            <tbody>
              {data.received_by_type.map((t) => (
                <tr key={t.type}><td>{feeLabel(t.type)}</td><td>{t.count} ×</td><td align="right">{money(t.total)}</td></tr>
              ))}
              <tr><td><b>Total</b></td><td /><td align="right"><b>{money(data.total_received)}</b></td></tr>
            </tbody>
          </table>

          <h3>Provider shares</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.92em" }}>
              <thead><tr><th align="left">Provider</th><th align="left">Fee type</th><th align="right">Tasks</th><th align="right">Fees</th><th align="right">Share %</th><th align="right">Provider share</th></tr></thead>
              <tbody>
                {shareRows.map((r) => (
                  <tr key={r.key}><td>{r.prov}</td><td>{r.fee}</td><td align="right">{r.count}</td><td align="right">{money(r.fees)}</td><td align="right">{r.pct == null ? "—" : `${r.pct}%`}</td><td align="right">{money(r.share)}</td></tr>
                ))}
                <tr>
                  <td colSpan={5}><b>Total provider shares</b></td>
                  <td align="right"><b>{money(shareRows.reduce((a, r) => a + r.share, 0))}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="list-row-meta">Shares use the percents currently set on each provider's Earnings page.</p>

          <h3>All fees received</h3>
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
        </>
      )}
    </div>
  );
}
