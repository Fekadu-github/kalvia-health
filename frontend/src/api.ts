const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* no json body */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface DevLoginPayload {
  username: string;
  full_name: string;
  role: "patient" | "provider" | "call_center_staff" | "admin";
  external_idp_subject: string;
  phone_number?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  role: string;
}

export interface Provider {
  provider_id: string;
  user_id: string;
  specialty: string;
  bio: string | null;
  languages: string | null;
  accepting_new_cases: string;
}

export interface Case {
  case_id: string;
  patient_id: string;
  provider_id: string;
  status: "open" | "in_follow_up" | "closed";
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface CaseNote {
  note_id: string;
  case_id: string;
  author_user_id: string;
  note_type: string;
  content: string;
  created_at: string;
}

export type ConsultationType = "video" | "audio" | "in_person";
export type AppointmentStatus = "requested" | "confirmed" | "cancelled" | "completed";

export interface Appointment {
  appointment_id: string;
  case_id: string;
  requested_by_user_id: string;
  consultation_type: ConsultationType;
  status: AppointmentStatus;
  scheduled_at: string;
  duration_minutes: number;
  jitsi_room_name: string | null;
  jitsi_join_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  prescription_id: string;
  case_id: string;
  appointment_id: string | null;
  issued_by_user_id: string;
  medication_name: string;
  dosage: string;
  instructions: string | null;
  created_at: string;
}

export const api = {
  devLogin: (payload: DevLoginPayload) =>
    request<TokenResponse>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: (token: string) => request("/me", {}, token),

  listProviders: (token: string, specialty?: string) =>
    request<Provider[]>(
      `/providers${specialty ? `?specialty=${encodeURIComponent(specialty)}` : ""}`,
      {},
      token
    ),

  createMyProviderProfile: (
    token: string,
    payload: { specialty: string; bio?: string; languages?: string }
  ) =>
    request<Provider>("/providers/me", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),

  listMyCases: (token: string) => request<Case[]>("/cases", {}, token),

  createCase: (token: string, payload: { provider_id: string; reason: string }) =>
    request<Case>("/cases", { method: "POST", body: JSON.stringify(payload) }, token),

  getCaseNotes: (token: string, caseId: string) =>
    request<CaseNote[]>(`/cases/${caseId}/notes`, {}, token),

  addCaseNote: (token: string, caseId: string, content: string, noteType = "general") =>
    request<CaseNote>(
      `/cases/${caseId}/notes`,
      { method: "POST", body: JSON.stringify({ content, note_type: noteType }) },
      token
    ),

  // --- Appointments ---
  requestAppointment: (
    token: string,
    payload: {
      case_id: string;
      consultation_type: ConsultationType;
      scheduled_at: string;
      duration_minutes?: number;
      notes?: string;
    }
  ) => request<Appointment>("/appointments", { method: "POST", body: JSON.stringify(payload) }, token),

  listMyAppointments: (token: string) => request<Appointment[]>("/appointments", {}, token),

  listCaseAppointments: (token: string, caseId: string) =>
    request<Appointment[]>(`/cases/${caseId}/appointments`, {}, token),

  confirmAppointment: (token: string, appointmentId: string) =>
    request<Appointment>(`/appointments/${appointmentId}/confirm`, { method: "POST" }, token),

  cancelAppointment: (token: string, appointmentId: string) =>
    request<Appointment>(`/appointments/${appointmentId}/cancel`, { method: "POST" }, token),

  completeAppointment: (token: string, appointmentId: string) =>
    request<Appointment>(`/appointments/${appointmentId}/complete`, { method: "POST" }, token),

  // --- Prescriptions ---
  issuePrescription: (
    token: string,
    payload: { case_id: string; appointment_id?: string; medication_name: string; dosage: string; instructions?: string }
  ) => request<Prescription>("/prescriptions", { method: "POST", body: JSON.stringify(payload) }, token),

  listCasePrescriptions: (token: string, caseId: string) =>
    request<Prescription[]>(`/cases/${caseId}/prescriptions`, {}, token),
};
