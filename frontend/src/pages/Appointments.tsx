import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Appointment, ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatWhen } from "../utils";
import { Chips } from "../components/ListTools";
import { usePersisted } from "../lib/usePersisted";

type ApptFilter = "upcoming" | "requested" | "past" | "all";

export default function Appointments() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = usePersisted<ApptFilter>("kalvia_f_appts", "upcoming", ["upcoming", "requested", "past", "all"]);

  useEffect(() => {
    if (!session) return;
    api
      .listMyAppointments(session.token)
      .then(setAppointments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load appointments"))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) return <p>Loading appointments…</p>;

  const now = Date.now();
  const live = (a: Appointment) => a.status === "requested" || a.status === "confirmed";
  const test: Record<ApptFilter, (a: Appointment) => boolean> = {
    upcoming: (a) => live(a) && new Date(a.scheduled_at).getTime() >= now,
    requested: (a) => a.status === "requested",
    past: (a) => !live(a) || new Date(a.scheduled_at).getTime() < now,
    all: () => true,
  };
  const count = (f: ApptFilter) => appointments.filter(test[f]).length;
  const shown = appointments
    .filter(test[filter])
    .sort((a, b) => (filter === "past" ? +new Date(b.scheduled_at) - +new Date(a.scheduled_at) : +new Date(a.scheduled_at) - +new Date(b.scheduled_at)));

  return (
    <div>
      <h2>My appointments</h2>
      {error && <p className="error-text">{error}</p>}

      {appointments.length > 0 && (
        <div className="list-tools">
          <Chips
            label="Filter appointments"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "upcoming", label: "Upcoming", count: count("upcoming") },
              { id: "requested", label: "Needs confirming", count: count("requested") },
              { id: "past", label: "Past & closed", count: count("past") },
              { id: "all", label: "All", count: count("all") },
            ]}
          />
        </div>
      )}

      {appointments.length === 0 ? (
        <div className="empty-state">No appointments scheduled across any of your cases yet.</div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          Nothing here.{" "}
          <button type="button" className="link-btn" onClick={() => setFilter("all")}>Show all appointments</button>
        </div>
      ) : (
        shown.map((a) => (
          <Link key={a.appointment_id} to={`/cases/${a.case_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={"list-row" + (a.status === "requested" ? " attn-row" : "")}>
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
