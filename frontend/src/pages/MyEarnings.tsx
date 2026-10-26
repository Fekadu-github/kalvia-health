import { useEffect, useState } from "react";
import { api, ApiError, MyEarnings as Data } from "../api";
import { useAuth } from "../context/AuthContext";
import { money, currentMonth, feeLabel } from "../lib/money";

export default function MyEarnings() {
  const { session } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api.myEarnings(session.token, month).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load earnings"));
  }, [session, month]);

  return (
    <div style={{ maxWidth: 760 }}>
      <h2>My earnings</h2>
      {error && <p className="error-text">{error}</p>}
      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="m">Month</label>
        <input id="m" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {!data ? <p>Loading…</p> : (
        <>
          <div className="list-row">
            <div className="list-row-title">
              {data.notified ? `Receivable for ${month}: ${money(data.share_total)}` : `${month}: awaiting admin statement`}
            </div>
            <div className="list-row-meta">
              Cases worked <b>{data.cases_worked}</b> · tasks done <b>{data.tasks_count}</b> · cases opened {data.cases_opened}
              {data.notified && <> · fees {money(data.gross)}</>}
            </div>
            {data.note && <div className="list-row-meta">Note: {data.note}</div>}
            <div className="list-row-meta">Overall receivable (all notified months): <b>{money(data.overall_receivable)}</b></div>
          </div>

          <h3>Tasks this month</h3>
          {data.tasks.length === 0 ? <div className="empty-state">No completed tasks this month.</div> : (
            <table style={{ width: "100%", fontSize: "0.92em" }}>
              <thead><tr><th align="left">Date</th><th align="left">Task</th><th align="left">Case</th><th align="right">Your share</th></tr></thead>
              <tbody>
                {data.tasks.map((t) => (
                  <tr key={t.payment_id}>
                    <td>{new Date(t.date).toLocaleDateString()}</td>
                    <td>{feeLabel(t.type)}</td>
                    <td>{t.case_number ?? t.case_id}</td>
                    <td align="right">{data.notified ? (t.share_percent == null ? "not shared" : `${t.share_percent}% = ${money(t.share_amount)}`) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Monthly statements</h3>
          {data.history.length === 0 ? <div className="empty-state">No statements yet.</div> :
            data.history.map((h) => (
              <div key={h.month} className="list-row">
                <div className="list-row-title">{h.month}: {money(h.amount)}</div>
                <div className="list-row-meta">of {money(h.gross)} · notified {new Date(h.notified_at).toLocaleDateString()}</div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
