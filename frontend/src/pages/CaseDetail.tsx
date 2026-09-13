import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Appointment, CaseNote, ConsultationType, Prescription, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AppointmentsSection({ caseId }: { caseId: string }) {
  const { session } = useAuth();
  const isProvider = session?.role === "provider";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [consultationType, setConsultationType] = useState<ConsultationType>("video");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!session) return;
    api
      .listCaseAppointments(session.token, caseId)
      .then(setAppointments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load appointments"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [session, caseId]);

  async function handleRequest() {
    if (!session || !scheduledAt) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestAppointment(session.token, {
        case_id: caseId,
        consultation_type: consultationType,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        notes: notes || undefined,
      });
      setScheduledAt("");
      setNotes("");
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not request appointment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(action: "confirm" | "cancel" | "complete", appointmentId: string) {
    if (!session) return;
    setBusyId(appointmentId);
    setError(null);
    try {
      if (action === "confirm") await api.confirmAppointment(session.token, appointmentId);
      if (action === "cancel") await api.cancelAppointment(session.token, appointmentId);
      if (action === "complete") await api.completeAppointment(session.token, appointmentId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update appointment");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h3>Appointments</h3>
        <button className="btn-outline btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Schedule"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <div className="inline-form">
          <div className="form-row">
            <div className="field">
              <label htmlFor="ctype">Type</label>
              <select
                id="ctype"
                value={consultationType}
                onChange={(e) => setConsultationType(e.target.value as ConsultationType)}
              >
                <option value="video">Video (Jitsi)</option>
                <option value="audio">Audio</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="when">Date &amp; time</label>
              <input
                id="when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="duration">Duration (min)</label>
              <input
                id="duration"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="appt-notes">Notes (optional)</label>
            <textarea id="appt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button className="btn" disabled={submitting || !scheduledAt} onClick={handleRequest}>
            {submitting ? "Requesting…" : "Request appointment"}
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading appointments…</p>
      ) : appointments.length === 0 ? (
        <div className="empty-state">No appointments scheduled yet.</div>
      ) : (
        appointments.map((a) => (
          <div key={a.appointment_id} className="list-row">
            <div className="list-row-title">
              {formatWhen(a.scheduled_at)} · {a.consultation_type.replace("_", " ")}
            </div>
            <div className="list-row-meta">
              <span className={`status-pill ${a.status}`}>{a.status}</span>
              {" · "}
              {a.duration_minutes} min
              {a.notes && <> · {a.notes}</>}
            </div>
            <div className="row-actions">
              {a.status === "confirmed" && a.jitsi_join_url && (
                <a className="btn" href={a.jitsi_join_url} target="_blank" rel="noreferrer">
                  Join video call
                </a>
              )}
              {isProvider && a.status === "requested" && (
                <button
                  className="btn-outline btn"
                  disabled={busyId === a.appointment_id}
                  onClick={() => handleAction("confirm", a.appointment_id)}
                >
                  Confirm
                </button>
              )}
              {isProvider && a.status === "confirmed" && (
                <button
                  className="btn-outline btn"
                  disabled={busyId === a.appointment_id}
                  onClick={() => handleAction("complete", a.appointment_id)}
                >
                  Mark complete
                </button>
              )}
              {(a.status === "requested" || a.status === "confirmed") && (
                <button
                  className="btn-outline btn"
                  disabled={busyId === a.appointment_id}
                  onClick={() => handleAction("cancel", a.appointment_id)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PrescriptionsSection({ caseId }: { caseId: string }) {
  const { session } = useAuth();
  const isProvider = session?.role === "provider";
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!session) return;
    api
      .listCasePrescriptions(session.token, caseId)
      .then(setPrescriptions)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load prescriptions"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [session, caseId]);

  async function handleIssue() {
    if (!session || !medicationName.trim() || !dosage.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.issuePrescription(session.token, {
        case_id: caseId,
        medication_name: medicationName,
        dosage,
        instructions: instructions || undefined,
      });
      setMedicationName("");
      setDosage("");
      setInstructions("");
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not issue prescription");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h3>Prescriptions</h3>
        {isProvider && (
          <button className="btn-outline btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Issue"}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <div className="inline-form">
          <div className="form-row">
            <div className="field">
              <label htmlFor="med">Medication</label>
              <input id="med" value={medicationName} onChange={(e) => setMedicationName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dosage">Dosage</label>
              <input
                id="dosage"
                placeholder="e.g. 500mg twice daily"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="instructions">Instructions (optional)</label>
            <textarea id="instructions" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <button className="btn" disabled={submitting || !medicationName.trim() || !dosage.trim()} onClick={handleIssue}>
            {submitting ? "Issuing…" : "Issue prescription"}
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading prescriptions…</p>
      ) : prescriptions.length === 0 ? (
        <div className="empty-state">No prescriptions on this case yet.</div>
      ) : (
        prescriptions.map((p) => (
          <div key={p.prescription_id} className="list-row">
            <div className="list-row-title">
              {p.medication_name} — {p.dosage}
            </div>
            <div className="list-row-meta">
              {new Date(p.created_at).toLocaleDateString()}
              {p.instructions && <> · {p.instructions}</>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const { session } = useAuth();
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  function loadNotes() {
    if (!session || !caseId) return;
    api
      .getCaseNotes(session.token, caseId)
      .then(setNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load notes"))
      .finally(() => setLoading(false));
  }

  useEffect(loadNotes, [session, caseId]);

  async function handlePost() {
    if (!session || !caseId || !draft.trim()) return;
    setPosting(true);
    try {
      await api.addCaseNote(session.token, caseId, draft);
      setDraft("");
      loadNotes();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post note");
    } finally {
      setPosting(false);
    }
  }

  if (!caseId) return null;

  return (
    <div>
      <AppointmentsSection caseId={caseId} />
      <hr className="hairline" />
      <PrescriptionsSection caseId={caseId} />
      <hr className="hairline" />

      <h2>Case timeline</h2>
      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading case…</p>
      ) : notes.length === 0 ? (
        <div className="empty-state">No notes yet on this case.</div>
      ) : (
        notes.map((n) => (
          <div key={n.note_id} className="note">
            <div className="note-meta">
              {n.note_type} · {new Date(n.created_at).toLocaleString()}
            </div>
            <div>{n.content}</div>
          </div>
        ))
      )}

      <hr className="hairline" />

      <div className="field">
        <label htmlFor="note">Add a note</label>
        <textarea id="note" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
      </div>
      <button className="btn" disabled={posting || !draft.trim()} onClick={handlePost}>
        {posting ? "Posting…" : "Post note"}
      </button>
    </div>
  );
}
