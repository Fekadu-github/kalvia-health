# Kalvia Health — Phase 2

Auth (patient/provider/call-center-staff/admin roles), provider
directory, case management with a timeline, and now **appointment
booking with Jitsi video consultations** and **prescriptions**. This
is the foundation everything else (nutrition, follow-up engine, SMS)
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

# Register/login a provider
curl -s -X POST $API/auth/dev-login -H "Content-Type: application/json" \
  -d '{"username":"dr_amanuel","full_name":"Dr. Amanuel Tesfaye","role":"provider","external_idp_subject":"prov001"}'
# -> copy access_token as PROVIDER

# Provider fills in their specialty
curl -s -X POST $API/providers/me -H "Authorization: Bearer $PROVIDER" \
  -H "Content-Type: application/json" \
  -d '{"specialty":"internal_medicine","bio":"General internal medicine, 8 years","languages":"Amharic,English"}'
# -> copy provider_id

# Register/login a patient
curl -s -X POST $API/auth/dev-login -H "Content-Type: application/json" \
  -d '{"username":"selam_k","full_name":"Selam Kebede","role":"patient","external_idp_subject":"pat001"}'
# -> copy access_token as PATIENT

# Patient browses providers
curl -s $API/providers -H "Authorization: Bearer $PATIENT"

# Patient opens a case with that provider
curl -s -X POST $API/cases -H "Authorization: Bearer $PATIENT" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"<paste provider_id>","reason":"Ongoing fatigue and weight loss, want a check-up"}'
# -> copy case_id

# Either side can add a timeline note
curl -s -X POST $API/cases/<case_id>/notes -H "Authorization: Bearer $PROVIDER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Reviewed intake, scheduling initial consult","note_type":"general"}'

curl -s $API/cases/<case_id>/notes -H "Authorization: Bearer $PATIENT"

# Patient requests a video appointment on the case
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

## Frontend (Phase 1)

```bash
cd frontend
npm install
cp .env.example .env   # points at your local backend by default
npm run dev
```

Open http://localhost:5173 — sign in as a **provider** first (set up a
specialty profile), then open a second browser/incognito window and
sign in as a **patient** to browse providers and open a case.

Once a case is open, its detail page now has **Appointments** and
**Prescriptions** sections above the timeline: either side can
request an appointment, the provider confirms/completes it, and a
confirmed video appointment shows a **Join video call** button
that opens the Jitsi room in a new tab. Providers get an **Issue**
button on Prescriptions. There's also a new **Appointments** nav
item — a cross-case agenda of everything scheduled, most-recent
last, linking back to the case it belongs to.

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

## What's deliberately NOT in Phase 2

- Nutrition plans + adherence tracking (Phase 4)
- Follow-up checkpoints/alerts (Phase 4)
- SMS/voice communication (Phase 5)
- Call center queueing — Asterisk/FreeSWITCH (Phase 3)
- Appointment reminders (SMS/email) — depends on Phase 5's messaging piece
- Self-hosted Jitsi — currently the free public `meet.jit.si`, swappable via `JITSI_BASE_URL`

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
