# Kalvia Health — Phase 3

Real patient signup/login (email or phone + password), admin-issued
provider accounts (dedicated username + password, no self-signup),
and a **triage/intake form** on each case — plus everything from
Phase 2 (appointment booking, Jitsi video, prescriptions). This is
the foundation everything else (nutrition, follow-up engine, SMS)
attaches to in later phases.

## Option A — run locally, no Docker (fastest to try)

```bash
pip install -r requirements.txt
export AUTH_MODE=dev
uvicorn backend.main:app --reload
```

Defaults to a local SQLite file (`care_platform.db`) — zero setup.
Swagger UI: http://127.0.0.1:8000/docs

Video consultations default to the free public Jitsi server. To
point at a self-hosted instance later, set one env var — no code
changes, same pattern as `DATABASE_URL`:
```bash
export JITSI_BASE_URL=https://meet.your-domain.org
```

## Option B — Docker Compose with Postgres (closer to how it'll run leased)

```bash
docker compose up --build
```

Same API, backed by Postgres instead of SQLite.

## Quick walkthrough

```bash
API=http://127.0.0.1:8000/api/v1

# Bootstrap the first admin account (dev-mode only — the ONLY role dev-login still accepts)
curl -s -X POST $API/auth/dev-login -H "Content-Type: application/json" \
  -d '{"username":"admin1","full_name":"Kalvia Admin","role":"admin","external_idp_subject":"admin001"}'
# -> copy access_token as ADMIN

# Admin issues a provider account (providers don't self-register)
curl -s -X POST $API/auth/admin/create-provider -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"username":"dr_amanuel","full_name":"Dr. Amanuel Tesfaye","password":"a-real-password","specialty":"internal_medicine","bio":"General internal medicine, 8 years","languages":"Amharic,English"}'

# Provider logs in with those credentials
curl -s -X POST $API/auth/provider/login -H "Content-Type: application/json" \
  -d '{"username":"dr_amanuel","password":"a-real-password"}'
# -> copy access_token as PROVIDER; provider_id is already set from account creation

# Patient signs up (email or phone + password)
curl -s -X POST $API/auth/patient/signup -H "Content-Type: application/json" \
  -d '{"full_name":"Selam Kebede","email":"selam@example.com","password":"a-real-password"}'
# -> copy access_token as PATIENT

# ...or logs back in later
curl -s -X POST $API/auth/patient/login -H "Content-Type: application/json" \
  -d '{"identifier":"selam@example.com","password":"a-real-password"}'

# Patient browses providers, opens a case
curl -s $API/providers -H "Authorization: Bearer $PATIENT"
curl -s -X POST $API/cases -H "Authorization: Bearer $PATIENT" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"<paste provider_id>","reason":"Ongoing fatigue and weight loss, want a check-up"}'
# -> copy case_id

# Patient starts triage — name/age/symptoms/duration required, rest optional
curl -s -X PUT $API/cases/<case_id>/triage -H "Authorization: Bearer $PATIENT" \
  -H "Content-Type: application/json" \
  -d '{"patient_name":"Selam Kebede","age":29,"symptoms":"Fatigue, unintended weight loss","duration":"3 weeks"}'

# Provider fills in what was left blank and marks it complete
curl -s -X PUT $API/cases/<case_id>/triage -H "Authorization: Bearer $PROVIDER" \
  -H "Content-Type: application/json" \
  -d '{"patient_name":"Selam Kebede","age":29,"symptoms":"Fatigue, unintended weight loss","duration":"3 weeks","severity":"moderate","medical_history":"No chronic conditions","mark_complete":true}'

curl -s $API/cases/<case_id>/triage -H "Authorization: Bearer $PATIENT"

# Either side can add a timeline note
curl -s -X POST $API/cases/<case_id>/notes -H "Authorization: Bearer $PROVIDER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Reviewed intake, scheduling initial consult","note_type":"general"}'

curl -s $API/cases/<case_id>/notes -H "Authorization: Bearer $PATIENT"

# Patient requests a video appointment on the case — independent of triage status
curl -s -X POST $API/appointments -H "Authorization: Bearer $PATIENT" \
  -H "Content-Type: application/json" \
  -d '{"case_id":"<case_id>","consultation_type":"video","scheduled_at":"2026-09-20T10:00:00","duration_minutes":30}'
# -> copy appointment_id; jitsi_join_url is already present (room is
#    created at request time), it just isn't shareable as "confirmed"
#    until the provider signs off

# Provider confirms it
curl -s -X POST $API/appointments/<appointment_id>/confirm -H "Authorization: Bearer $PROVIDER"
# -> response now includes jitsi_join_url, e.g. https://meet.jit.si/care-<case_id>-xxxxxxxx

# Provider marks it complete after the call, then issues a prescription
curl -s -X POST $API/appointments/<appointment_id>/complete -H "Authorization: Bearer $PROVIDER"

curl -s -X POST $API/prescriptions -H "Authorization: Bearer $PROVIDER" \
  -H "Content-Type: application/json" \
  -d '{"case_id":"<case_id>","appointment_id":"<appointment_id>","medication_name":"Amoxicillin","dosage":"500mg twice daily","instructions":"Take with food for 7 days"}'

# Either side can see the case's appointments/prescriptions
curl -s $API/cases/<case_id>/appointments -H "Authorization: Bearer $PATIENT"
curl -s $API/cases/<case_id>/prescriptions -H "Authorization: Bearer $PATIENT"

# Cross-case agenda — every appointment across all of a user's cases
curl -s $API/appointments -H "Authorization: Bearer $PATIENT"
```

### Auth model

- **Patients** sign up themselves with `full_name` + `password` + at
  least one of `email` / `phone_number`, via `/auth/patient/signup`,
  and log back in via `/auth/patient/login` with either identifier.
- **Providers** never self-register. An **admin** issues their
  `username` + `password` via `/auth/admin/create-provider`, and
  hands the credentials to them directly. Providers log in via
  `/auth/provider/login`.
- **Admin** accounts still go through `/auth/dev-login`, but that
  endpoint now rejects any role other than `admin` — it exists purely
  to bootstrap the first admin, not as a general-purpose login.
  Passwords are hashed with bcrypt (`passlib`), never stored plain.

### Triage / intake

`patient_name`, `age`, `symptoms`, and `duration` are required to
submit a triage record at all; `severity`, `medical_history`,
`medications`, `allergies`, and `additional_notes` are optional.
`PUT /cases/{case_id}/triage` is an upsert — the patient's first
submission creates it, and either side calling it again updates the
same record. Only a provider (or admin/call-center-staff) can set
`mark_complete: true`. Booking an appointment does **not** require
triage to be started or complete — they're independent.

### Appointment lifecycle

`requested` → `confirmed` → `completed`, or `cancelled` from either
of the first two states.

- **Request**: either participant (patient or provider) on the case.
- **Confirm** / **complete**: provider only (or admin/call-center-staff).
- **Cancel**: either participant, from `requested` or `confirmed`.

A `video` appointment gets its Jitsi room name generated at request
time (`care-<case_id>-<random>` — not guessable from the case ID
alone), so `jitsi_join_url` is populated on the very first response;
the frontend only shows the **Join video call** button once the
appointment is `confirmed`, though.

Authorization for both appointments and prescriptions goes through
`backend/access.py`'s `get_case_or_404` / `assert_case_participant` —
the same participant check cases already use, now shared across
routers instead of duplicated.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env   # points at your local backend by default
npm run dev
```

Open http://localhost:5173. The login screen has **Patient** and
**Provider** tabs, plus a small **Admin access** link at the bottom
(dev-mode bootstrap). Recommended order to try it:

1. Click **Admin access**, pick any username/full name, and sign in
   — you'll land on **Create provider**.
2. Fill in a username, password, and specialty for a provider, submit
   it, and note the credentials shown.
3. Sign out, switch to the **Provider** tab, and log in with those
   credentials — set up the rest of the profile if prompted.
4. Open a second incognito window, go to the **Patient** tab, and
   **Create an account** with an email or phone + password.
5. As the patient, browse providers and open a case. On the case
   page, **Triage** sits above Appointments — fill in the four
   required fields (name, age, symptoms, duration) and save.
6. Switch to the provider window, open the same case, fill in any of
   the optional triage fields you want, check **Mark triage as
   complete**, and save.
7. Try scheduling a video appointment and confirming it — the
   **Join video call** button opens the Jitsi room. Providers get an
   **Issue** button on Prescriptions. The **Appointments** nav item
   is a cross-case agenda of everything scheduled.

**Heads up if you're upgrading from Phase 2:** accounts created
through the old dev-login (any pre-existing patient/provider test
users) have no password set and won't work with the new login forms.
Re-create them through the new signup/admin-creation flow.

## Deploying publicly (Supabase + Render + Netlify)

**1. Database — Supabase**
Create a project at supabase.com, then from Project Settings → Database
copy the connection string. That's your backend's `DATABASE_URL` — no
code changes needed, it already reads this from the environment.

**2. Backend — Render**
Push this repo to GitHub. In Render: New → Web Service → connect the
repo (it detects the `Dockerfile` automatically). Set environment
variables:
```
AUTH_MODE=dev
DATABASE_URL=<your Supabase connection string>
JWT_SECRET=<a real random secret>
```
Render gives you a public URL like `https://your-app.onrender.com`.

**3. Frontend — Netlify**
Connect the same repo, set the base directory to `frontend`, build
command `npm run build`, publish directory `dist` (already configured
in `netlify.toml`). Set the environment variable:
```
VITE_API_URL=https://your-app.onrender.com/api/v1
```

## What's deliberately NOT in Phase 3

- Nutrition plans + adherence tracking (Phase 4)
- Follow-up checkpoints/alerts (Phase 4)
- SMS/voice communication (Phase 5)
- Call center queueing — Asterisk/FreeSWITCH (Phase 3-cont'd)
- Appointment reminders (SMS/email) — depends on Phase 5's messaging piece
- Self-hosted Jitsi — currently the free public `meet.jit.si`, swappable via `JITSI_BASE_URL`
- Real OIDC login — `AUTH_MODE` still defaults to a placeholder; the
  admin bootstrap path exists only because `AUTH_MODE=dev` is set
- Password reset / "forgot password" flow
- Email/SMS verification at signup (accounts are usable immediately)

Each of those is a new router + a few tables that hang off `case_id`
— the auth/role pattern here doesn't change.

## A note on verification

Every backend file here was syntax-checked with `py_compile` **and**
cross-checked by hand (imports vs. actual model/schema definitions,
enum values, relationship names). The sandbox this was built in has
no network access, so `pip install` / `npm install` and an actual
boot-and-click-through test aren't possible here — same limitation
as Phase 1. Please run both sides locally (Option A above +
`npm run dev`) and flag anything that breaks.
