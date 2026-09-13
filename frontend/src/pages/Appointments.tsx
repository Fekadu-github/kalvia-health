import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Appointment, ApiError } from "../api";
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

export default function Appointments() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api
      .listMyAppointments(session.token)
      .then(setAppointments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load appointments"))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p>Loading appointments…</p>;

  return (
    <div>
      <h2>My appointments</h2>
      {error && <p className="error-text">{error}</p>}

      {appointments.length === 0 ? (
        <div className="empty-state">No appointments scheduled across any of your cases yet.</div>
      ) : (
        appointments.map((a) => (
          <Link
            key={a.appointment_id}
            to={`/cases/${a.case_id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="list-row">
              <div className="list-row-title">
                {formatWhen(a.scheduled_at)} · {a.consultation_type.replace("_", " ")}
              </div>
              <div className="list-row-meta">
                <span className={`status-pill ${a.status}`}>{a.status}</span>
                {" · "}
                {a.duration_minutes} min
                {a.notes && <> · {a.notes}</>}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
