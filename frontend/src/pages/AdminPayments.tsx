import { useEffect, useState } from "react";
import { api, ApiError, AdminPayment, PaymentStatus, PaymentType } from "../api";
import { useAuth } from "../context/AuthContext";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  registration: "Registration fee",
  first_consultation: "First consultation fee",
  video_consultation: "Video consultation fee",
  prescription: "Prescription fee",
};

export default function AdminPayments() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<PaymentStatus | "all">("pending");
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});

  function load() {
    if (!session) return;
    setLoading(true);
    api
      .adminListPayments(session.token, filter === "all" ? undefined : filter)
      .then(setPayments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load payments"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [session, filter]);

  async function handleApprove(paymentId: string) {
    if (!session) return;
    setActioningId(paymentId);
    try {
      await api.adminApprovePayment(session.token, paymentId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not approve that payment");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(paymentId: string) {
    if (!session) return;
    const reason = window.prompt("Reason for rejecting this payment (shown to the patient):") || undefined;
    setActioningId(paymentId);
    try {
      await api.adminRejectPayment(session.token, paymentId, reason);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reject that payment");
    } finally {
      setActioningId(null);
    }
  }

  async function handleViewProof(paymentId: string) {
    if (!session) return;
    if (proofUrls[paymentId]) return; // already loaded — the <img> below just shows it
    try {
      const blob = await api.fetchPaymentProof(session.token, paymentId);
      setProofUrls((prev) => ({ ...prev, [paymentId]: URL.createObjectURL(blob) }));
    } catch {
      setError("Could not load that proof image");
    }
  }

  async function handleViewIdDocument(patientId: string) {
    if (!session) return;
    try {
      const blob = await api.fetchPatientIdDocument(session.token, patientId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setError("No ID document on file for that patient, or it could not be loaded");
    }
  }

  if (loading) return <p>Loading payments…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>Payment review</h2>
      {error && <p className="error-text">{error}</p>}

      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="filter">Show</label>
        <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value as PaymentStatus | "all")}>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {payments.length === 0 ? (
        <div className="empty-state">Nothing here.</div>
      ) : (
        payments.map((p) => (
          <div key={p.payment_id} className="list-row">
            <div className="list-row-title">
              {p.patient.full_name} — {PAYMENT_TYPE_LABEL[p.payment_type]}
            </div>
            <div className="list-row-meta">
              <span className={`status-pill ${p.status}`}>{p.status}</span>
              {p.amount && ` · ${p.amount}`}
              {p.reference_note && ` · Ref: ${p.reference_note}`}
              {p.case_id && ` · Case ${p.case_id}`}
              {" · " + new Date(p.created_at).toLocaleString()}
            </div>

            <div style={{ marginTop: "0.6em", display: "flex", gap: "0.6em", flexWrap: "wrap" }}>
              {p.has_proof && (
                <button type="button" className="btn-outline btn" onClick={() => handleViewProof(p.payment_id)}>
                  View proof
                </button>
              )}
              <button type="button" className="btn-outline btn" onClick={() => handleViewIdDocument(p.patient_id)}>
                View patient's ID
              </button>
              {p.status === "pending" && (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={actioningId === p.payment_id}
                    onClick={() => handleApprove(p.payment_id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn"
                    disabled={actioningId === p.payment_id}
                    onClick={() => handleReject(p.payment_id)}
                  >
                    Reject
                  </button>
                </>
              )}
            </div>

            {proofUrls[p.payment_id] && (
              <img
                src={proofUrls[p.payment_id]}
                alt="Payment proof"
                style={{ marginTop: "0.6em", maxWidth: 260, maxHeight: 200, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 4 }}
              />
            )}

            {p.status === "rejected" && p.rejection_reason && (
              <p style={{ marginBottom: 0, marginTop: "0.4em" }}>Rejected: {p.rejection_reason}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
