import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, Case, Payment, PatientMeOut, PaymentType } from "../api";
import { useAuth } from "../context/AuthContext";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  registration: "Registration fee",
  first_consultation: "First consultation fee",
  video_consultation: "Video consultation fee",
  prescription: "Prescription fee",
};

// Fees that must name the case they're for. first_consultation can name one
// too, but may also be paid before choosing — it's then used by the next case.
const CASE_REQUIRED: PaymentType[] = ["video_consultation", "prescription"];

const caseLabel = (c: Case) => `${c.case_number ?? c.case_id} — ${c.reason.length > 48 ? c.reason.slice(0, 48) + "…" : c.reason}`;

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for admin approval",
  approved: "Approved",
  rejected: "Rejected",
};

export default function Payments() {
  const { session } = useAuth();
  const [params] = useSearchParams(); // /payments?case=<id>&type=video_consultation (from a case page)
  const [status, setStatus] = useState<PatientMeOut | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [idDocError, setIdDocError] = useState<string | null>(null);
  const [idDocUploading, setIdDocUploading] = useState(false);
  const idFileInputRef = useRef<HTMLInputElement>(null);

  const typeParam = params.get("type") as PaymentType | null;
  const [paymentType, setPaymentType] = useState<PaymentType>(
    typeParam && typeParam in PAYMENT_TYPE_LABEL ? typeParam : "registration"
  );
  const [caseId, setCaseId] = useState(params.get("case") ?? "");
  const [amount, setAmount] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const caseRequired = CASE_REQUIRED.includes(paymentType);
  const needsCaseField = paymentType !== "registration"; // registration is patient-level, never tied to a case
  const blockedNoCase = caseRequired && cases.length === 0;

  function loadAll() {
    if (!session) return;
    setLoading(true);
    Promise.all([api.getMyPatientStatus(session.token), api.listMyPayments(session.token), api.listMyCases(session.token)])
      .then(([s, p, c]) => {
        setStatus(s);
        setPayments(p);
        setCases([...c].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your payment status"))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [session]);

  // Keep the case dropdown valid: drop a stale/foreign id from the URL, and
  // pre-pick the case when the patient only has one.
  useEffect(() => {
    if (loading) return; // cases haven't arrived yet — don't judge the id from the URL against an empty list
    if (caseId && !cases.some((c) => c.case_id === caseId)) setCaseId("");
    else if (!caseId && cases.length === 1 && CASE_REQUIRED.includes(paymentType)) setCaseId(cases[0].case_id);
  }, [loading, cases, caseId, paymentType]);

  useEffect(() => {
    if (!session || !status?.has_id_document) return;
    let cancelled = false;
    api
      .fetchMyIdDocument(session.token)
      .then((blob) => {
        if (cancelled) return;
        setIdDocUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        /* non-fatal — just don't show a preview */
      });
    return () => {
      cancelled = true;
    };
  }, [session, status?.has_id_document]);

  async function handleIdDocSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !session) return;
    setIdDocError(null);
    setIdDocUploading(true);
    try {
      const updated = await api.uploadMyIdDocument(session.token, file);
      setStatus(updated);
    } catch (err) {
      setIdDocError(err instanceof ApiError ? err.message : "Could not upload that file");
    } finally {
      setIdDocUploading(false);
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSubmitError(null);
    setSubmitted(false);
    setSubmitting(true);
    try {
      await api.submitPayment(session.token, {
        payment_type: paymentType,
        case_id: needsCaseField ? caseId || undefined : undefined,
        amount: amount || undefined,
        reference_note: referenceNote || undefined,
        proof: proofFile || undefined,
      });
      setSubmitted(true);
      setCaseId("");
      setAmount("");
      setReferenceNote("");
      setProofFile(null);
      loadAll();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not submit that payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading your account status…</p>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>Payments & documents</h2>
      {error && <p className="error-text">{error}</p>}

      {/* --- Registration status --- */}
      <div className="inline-form">
        <strong>{status?.registration_active ? "Registration active" : "Registration required"}</strong>
        <p style={{ color: "var(--ink-soft)", marginBottom: 0 }}>
          {status?.registration_active
            ? "Your registration fee is on file and active. It stays valid as long as you keep using the service — after 90 days of no activity, it lapses and you'll need to pay it again."
            : "Submit a registration payment below and wait for admin approval before booking an appointment."}
        </p>
      </div>

      {/* --- ID document --- */}
      <div className="inline-form">
        <label style={{ marginBottom: "0.6em" }}>National ID / passport</label>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", marginTop: 0 }}>
          Optional for now, but you'll need this on file before you can book an appointment. A photo or a
          PDF scan both work. Only you and admins can ever see this.
        </p>
        {status?.has_id_document && (
          <p style={{ color: "var(--primary)" }}>
            Uploaded{status.id_document_uploaded_at ? ` on ${new Date(status.id_document_uploaded_at).toLocaleDateString()}` : ""}.
          </p>
        )}
        {idDocUrl && (
          <div style={{ marginBottom: "0.8em" }}>
            <img
              src={idDocUrl}
              alt="Your uploaded ID"
              style={{ maxWidth: 220, maxHeight: 160, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 4 }}
              onError={() => setIdDocUrl(null)} // e.g. a PDF was uploaded — no inline preview, that's fine
            />
          </div>
        )}
        <input
          ref={idFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={handleIdDocSelected}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="btn-outline btn"
          disabled={idDocUploading}
          onClick={() => idFileInputRef.current?.click()}
        >
          {idDocUploading ? "Uploading…" : status?.has_id_document ? "Replace document" : "Upload document"}
        </button>
        {idDocError && <p className="error-text">{idDocError}</p>}
      </div>

      {/* --- Submit a payment --- */}
      <div className="inline-form">
        <label style={{ marginBottom: "0.6em" }}>Submit a payment</label>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", marginTop: 0 }}>
          No online payment gateway yet — pay via your usual method (mobile money, bank transfer, etc.),
          then tell us what you paid here. An admin reviews and approves it before it takes effect.
        </p>
        {submitted && <p style={{ color: "var(--primary)" }}>Submitted — waiting on admin approval.</p>}
        <form onSubmit={handleSubmitPayment}>
          <div className="field">
            <label htmlFor="paymentType">What is this payment for?</label>
            <select
              id="paymentType"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PaymentType)}
            >
              {Object.entries(PAYMENT_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {needsCaseField && (
            <div className="field">
              <label htmlFor="caseId">Case number{caseRequired ? "" : " (optional)"}</label>
              {cases.length === 0 ? (
                <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", margin: 0 }}>
                  {caseRequired ? "You don't have a case yet — " : "You don't have a case yet. You can pay now and it will be applied to your next case, or "}
                  <Link to="/providers">find a provider and open a case</Link>
                  {caseRequired ? " first. Opening a case is free and gives you a case number right away." : "."}
                </p>
              ) : (
                <>
                  <select id="caseId" value={caseId} onChange={(e) => setCaseId(e.target.value)} required={caseRequired}>
                    <option value="">{caseRequired ? "Choose a case…" : "No case yet — apply to my next case"}</option>
                    {cases.map((c) => (
                      <option key={c.case_id} value={c.case_id}>
                        {caseLabel(c)}
                      </option>
                    ))}
                  </select>
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.78rem", margin: "0.4em 0 0" }}>
                    Your case numbers are also listed on <Link to="/cases">My cases</Link>.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="form-row">
            <div className="field">
              <label htmlFor="amount">Amount paid</label>
              <input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 500 ETB"
              />
            </div>
            <div className="field">
              <label htmlFor="referenceNote">Transaction reference (optional)</label>
              <input
                id="referenceNote"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="e.g. Telebirr transaction ID"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="proof">Proof of payment (optional screenshot)</label>
            <input
              id="proof"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
            />
          </div>
          <button type="submit" className="btn" disabled={submitting || blockedNoCase}>
            {submitting ? "Submitting…" : "Submit payment"}
          </button>
          {submitError && <p className="error-text">{submitError}</p>}
        </form>
      </div>

      {/* --- History --- */}
      <div className="inline-form">
        <label style={{ marginBottom: "0.6em" }}>Payment history</label>
        {payments.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>No payments submitted yet.</p>
        ) : (
          payments.map((p) => (
            <div key={p.payment_id} className="list-row">
              <div className="list-row-title">{PAYMENT_TYPE_LABEL[p.payment_type]}</div>
              <div className="list-row-meta">
                <span className={`status-pill ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                {p.case_id && ` · Case ${p.case_number ?? p.case_id}`}
                {p.amount && ` · ${p.amount}`}
                {" · Submitted " + new Date(p.created_at).toLocaleDateString()}
              </div>
              {p.status === "rejected" && p.rejection_reason && (
                <p style={{ marginBottom: 0, marginTop: "0.4em" }}>Admin note: {p.rejection_reason}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
