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

async function requestMultipart<T>(
  path: string,
  method: string,
  formData: FormData,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // No Content-Type here on purpose — the browser sets
  // multipart/form-data with the right boundary itself.
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: formData });

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

export interface PatientSignupPayload {
  full_name: string;
  password: string;
  email?: string;
  phone_number?: string;
}

export interface LoginPayload {
  identifier: string; // email or phone
  password: string;
}

export interface ProviderLoginPayload {
  username: string;
  password: string;
}

export interface AdminBootstrapPayload {
  bootstrap_secret: string;
  username: string;
  full_name: string;
  password: string;
}

export interface AdminLoginPayload {
  username: string;
  password: string;
}

export interface PasswordResetConfirmPayload {
  identifier: string;
  code: string;
  new_password: string;
}

export interface ProviderCreatePayload {
  username: string;
  full_name: string;
  password: string;
  specialty: string;
  bio?: string;
  languages?: string;
  license_number?: string;
  years_experience?: number;
  experience_summary?: string;
}

export interface ProviderAccount {
  username: string;
  full_name: string;
  provider_id: string;
}

export type ProviderApprovalStatus = "pending" | "approved" | "rejected";

export interface MyProviderProfilePayload {
  specialty: string;
  bio?: string;
  languages?: string;
  license_number: string;
  years_experience?: number;
  experience_summary?: string;
}

export interface MyProviderProfileUpdatePayload {
  specialty?: string;
  bio?: string;
  languages?: string;
  license_number?: string;
  years_experience?: number;
  experience_summary?: string;
  accepting_new_cases?: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  role: string;
}

export interface Provider {
  provider_id: string;
  user_id?: string; // present only on the full (admin/provider-self) view, not the patient-facing view
  specialty: string;
  bio: string | null;
  languages: string | null;
  accepting_new_cases: string;
  years_experience?: number | null;
  experience_summary?: string | null;
  photo_url?: string | null;
  // Full-profile-only fields — absent from what patients receive.
  license_number?: string | null;
  approval_status?: ProviderApprovalStatus;
  rejection_reason?: string | null;
  approved_at?: string | null;
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

export interface Triage {
  triage_id: string;
  case_id: string;
  patient_name: string;
  age: number;
  symptoms: string;
  duration: string;
  severity: string | null;
  medical_history: string | null;
  medications: string | null;
  allergies: string | null;
  additional_notes: string | null;
  is_complete: "true" | "false";
  completed_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserSummary {
  user_id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
}

export interface AdminCaseSummary {
  case_id: string;
  status: "open" | "in_follow_up" | "closed";
  reason: string;
  created_at: string;
  updated_at: string;
  patient: AdminUserSummary;
  appointments: Appointment[];
}

export interface AdminProviderOverview {
  provider: Provider;
  user: AdminUserSummary;
  patient_count: number;
  case_count: number;
  cases: AdminCaseSummary[];
}

export interface AdminSummary {
  total_providers: number;
  total_patients: number;
  total_cases: number;
  total_appointments: number;
  providers_pending_approval: number;
  cases_by_status: Record<string, number>;
  appointments_by_status: Record<string, number>;
}

export const api = {
  devLogin: (payload: DevLoginPayload) =>
    request<TokenResponse>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  patientSignup: (payload: PatientSignupPayload) =>
    request<TokenResponse>("/auth/patient/signup", { method: "POST", body: JSON.stringify(payload) }),

  patientLogin: (payload: LoginPayload) =>
    request<TokenResponse>("/auth/patient/login", { method: "POST", body: JSON.stringify(payload) }),

  providerLogin: (payload: ProviderLoginPayload) =>
    request<TokenResponse>("/auth/provider/login", { method: "POST", body: JSON.stringify(payload) }),

  adminBootstrap: (payload: AdminBootstrapPayload) =>
    request<TokenResponse>("/auth/admin/bootstrap", { method: "POST", body: JSON.stringify(payload) }),

  adminLogin: (payload: AdminLoginPayload) =>
    request<TokenResponse>("/auth/admin/login", { method: "POST", body: JSON.stringify(payload) }),

  requestPasswordReset: (identifier: string) =>
    request<{ message: string }>("/auth/password/request-reset", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  confirmPasswordReset: (payload: PasswordResetConfirmPayload) =>
    request<TokenResponse>("/auth/password/confirm-reset", { method: "POST", body: JSON.stringify(payload) }),

  createProviderAccount: (token: string, payload: ProviderCreatePayload) =>
    request<ProviderAccount>("/auth/admin/create-provider", { method: "POST", body: JSON.stringify(payload) }, token),

  me: (token: string) => request("/me", {}, token),

  listProviders: (token: string, specialty?: string) =>
    request<Provider[]>(
      `/providers${specialty ? `?specialty=${encodeURIComponent(specialty)}` : ""}`,
      {},
      token
    ),

  createMyProviderProfile: (token: string, payload: MyProviderProfilePayload) =>
    request<Provider>("/providers/me", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),

  getMyProviderProfile: (token: string) => request<Provider>("/providers/me", {}, token),

  updateMyProviderProfile: (token: string, payload: MyProviderProfileUpdatePayload) =>
    request<Provider>("/providers/me", { method: "PATCH", body: JSON.stringify(payload) }, token),

  uploadMyProviderPhoto: (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestMultipart<Provider>("/providers/me/photo", "PUT", formData, token);
  },

  deleteMyProviderPhoto: (token: string) =>
    request<Provider>("/providers/me/photo", { method: "DELETE" }, token),

  approveProvider: (token: string, providerId: string) =>
    request<Provider>(`/providers/${providerId}/approve`, { method: "POST" }, token),

  rejectProvider: (token: string, providerId: string, rejectionReason?: string) =>
    request<Provider>(
      `/providers/${providerId}/reject`,
      { method: "POST", body: JSON.stringify({ rejection_reason: rejectionReason }) },
      token
    ),

  // --- Admin dashboard ---
  getAdminProvidersOverview: (token: string) =>
    request<AdminProviderOverview[]>("/admin/providers-overview", {}, token),

  getAdminSummary: (token: string) => request<AdminSummary>("/admin/summary", {}, token),

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

  // --- Triage ---
  upsertTriage: (
    token: string,
    caseId: string,
    payload: {
      patient_name: string;
      age: number;
      symptoms: string;
      duration: string;
      severity?: string;
      medical_history?: string;
      medications?: string;
      allergies?: string;
      additional_notes?: string;
      mark_complete?: boolean;
    }
  ) => request<Triage>(`/cases/${caseId}/triage`, { method: "PUT", body: JSON.stringify(payload) }, token),

  getTriage: (token: string, caseId: string) => request<Triage | null>(`/cases/${caseId}/triage`, {}, token),
};
