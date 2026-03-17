# PeerLearn — plan.md
> Single source of truth for the entire project.  
> Generated from codebase scan on 2026-03-16.  
> Do NOT edit the Frontend Status section manually — re-scan codebase to update it.

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Complete — no work needed |
| 🔗 | Partial — UI exists, backend API not yet wired |
| ❌ | Not started |
| `[ ]` | Task not started |
| `[~]` | Task in progress |
| `[x]` | Task done |

---

## 0 — Codebase Scan Summary (auto-detected)

### Backend Reality
The repository contains a **blank Node.js/Express skeleton** (`backend/src/server.js` is empty).  
There are **zero Python files**. The entire FastAPI backend must be built from scratch.  
The Node.js skeleton (`backend/package.json`, `backend/src/`) should be deleted once the Python backend is in place.

### Frontend Reality
- `axios` is installed but `src/services/api.js` is completely empty.  
- **Zero API calls exist** anywhere in the frontend — all data is hardcoded mock arrays.  
- `AuthContext.jsx` calls Supabase Auth SDK directly (not FastAPI). This needs to be migrated to call `POST /auth/login` and `POST /auth/register` so the backend can enforce `.edu.sg` validation and write the audit log.
- `Login.jsx` and `SessionMessaging.jsx` are empty placeholder files (1 line each).

---

## 1 — Frontend Status

### Components

| File | Status | Notes |
|------|--------|-------|
| `src/components/ProtectedRoute.jsx` | ✅ Complete | Reads from AuthContext; redirects to `/login` if unauthenticated. Do not modify. |
| `src/components/DashboardLayout.jsx` | 🔗 Partial | Nav, 5-tab bar, profile dropdown all rendered. Badge counts are hardcoded props — not from API. Missing: wire badge counts to `GET /dashboard/badges`. |

### Pages

| File | Status | Notes |
|------|--------|-------|
| `src/pages/LandingPage.jsx` | 🔗 Partial | Full UI with hero, modals for Login/Signup/VerifyEmail. Missing: Login modal `onSubmit` → `POST /auth/login`; Signup modal `onSubmit` → `POST /auth/register`; Forgot Password → `POST /auth/forgot-password`; Resend Verification → `POST /auth/resend-verification`. |
| `src/pages/Login.jsx` | ❌ Not started | File exists but is 1 line. Needs full implementation: email+password fields, `POST /auth/login`, error states for locked/unverified/invalid domain accounts, resend link. |
| `src/pages/Dashboard.jsx` | 🔗 Partial | All 5 tabs rendered with hardcoded mock data. Zero API calls. Needs: `GET /dashboard/summary`, `GET /sessions`, `GET /tutor/requests/incoming`, `GET /notifications`, `POST /sessions/{id}/accept`, `POST /sessions/{id}/decline`, `POST /payments/initiate`, `PATCH /sessions/{id}/outcome`. |
| `src/pages/TuteeRequest.jsx` | 🔗 Partial | 6-step flow UI complete. SRS mismatch: duration shows 30min/1hr/1.5hr/2hr — must be 1h/2h/4h only. Zero API calls. Needs: `POST /requests`, `GET /matching/recommendations`, `GET /venues/recommend`, `POST /payments/initiate`. |
| `src/pages/OfferToTutor.jsx` | 🔗 Partial | 3-step flow UI complete. SRS mismatch: max weekly load shows 15h/20h — must be 2h/3h/5h/8h/10h only. Academic levels field missing entirely. Zero API calls. Needs: `POST /tutor-profile`, `PATCH /tutor-profile/mode`. |
| `src/pages/ProfileSettings.jsx` | 🔗 Partial | 4-tab UI complete. All tabs show hardcoded data. Zero API calls. Needs: `GET /users/me`, `PATCH /users/me`, `GET /tutor-profile`, `PUT /tutor-profile`, `PATCH /tutor-profile/mode`, `GET /users/me/privacy`, `PATCH /users/me/privacy`, `POST /auth/change-password`. |
| `src/pages/SessionMessaging.jsx` | ❌ Not started | File exists but is 1 line. Needs full implementation: `GET /sessions/{id}/messages` (poll or WebSocket), `POST /sessions/{id}/messages`, read-only mode after Completed/Cancelled, block personal contact info display. |
| `src/pages/FeedbackForm.jsx` | 🔗 Partial | Star rating, review textarea, trait tags rendered. SRS mismatch: `maxLength={100}` — SRS requires max 500 chars. Zero API calls. Needs: `POST /sessions/{id}/rating`, `GET /sessions/{id}`, no-show marking UI. |

### Pages Not Started (no file exists)

| File | Notes |
|------|-------|
| `src/pages/SignUp.jsx` | Separate signup page at `/signup` (route is commented out in App.jsx) |
| `src/pages/VerifyEmail.jsx` | Email verification success/expired page at `/verify-email` |
| `src/pages/ResetPassword.jsx` | Password reset via token link at `/reset-password` |
| `src/pages/SessionDetail.jsx` | Session detail view at `/session/:sessionId` |
| `src/pages/Admin/Overview.jsx` | Admin overview dashboard |
| `src/pages/Admin/DemandAnalytics.jsx` | Demand analytics page |
| `src/pages/Admin/SupplyAnalytics.jsx` | Supply analytics page |
| `src/pages/Admin/GapAnalysis.jsx` | Gap analysis page |
| `src/pages/Complaints.jsx` | Complaint submission form |
| `src/pages/PenaltyAppeal.jsx` | Penalty appeal form |

### Services

| File | Status | Notes |
|------|--------|-------|
| `src/services/supabaseClient.js` | ✅ Complete | Supabase client init. Must only be used for auth email redirect helpers, NOT for data queries. |
| `src/services/AuthContext.jsx` | 🔗 Partial | Auth state managed. Missing: `.edu.sg` validation before signUp, user roles exposed, migration from Supabase Auth SDK to FastAPI `POST /auth/login` + `POST /auth/register`. |
| `src/services/api.js` | ❌ Not started | Completely empty. Needs: Axios instance with `VITE_API_URL` base, `Authorization: Bearer <token>` injected from AuthContext, global 401 redirect to `/login`. |

---

## 2 — Backend API Requirements

### Auth Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/auth/register` | `users`, `user_credentials`, `email_verifications` | UC-1.1, 2.1.1 |
| `POST` | `/auth/verify-email` | `email_verifications`, `users` | UC-1.2, 2.1.1 |
| `POST` | `/auth/resend-verification` *(rate-limited: 3/hr)* | `email_verifications`, `users` | UC-1.3, UC-1.6, 2.1.1 |
| `POST` | `/auth/login` | `users`, `user_credentials`, `audit_logs` | UC-1.4, 2.1.2 |
| `POST` | `/auth/forgot-password` *(rate-limited: 3/hr)* | `password_resets`, `users` | UC-1.5, 2.1.2 |
| `POST` | `/auth/reset-password` | `password_resets`, `users`, `user_credentials` | UC-1.5, 2.1.2 |
| `POST` | `/auth/change-password` *(auth required)* | `user_credentials` | 2.1.2 |
| `POST` | `/auth/refresh` | *(JWT only)* | 2.1.2 |

### User Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/users/me` | `users` | UC-2.2, 2.11 |
| `PATCH` | `/users/me` | `users` | UC-2.2 |
| `GET` | `/users/me/privacy` | `users` | UC-2.2 |
| `PATCH` | `/users/me/privacy` | `users` | UC-2.2 |

### Dashboard Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/dashboard/summary` | `tutoring_sessions`, `tutoring_requests` | UC-2.1, 2.11 |
| `GET` | `/dashboard/badges` | `notifications`, `tutoring_sessions`, `messaging_channels` | UC-2.1, 2.11 |

### Notifications Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/notifications` | `notifications` | UC-2.3, 2.11 |
| `PATCH` | `/notifications/{id}` | `notifications` | UC-2.3 |
| `POST` | `/notifications/read-all` | `notifications` | UC-2.3 |

### Tutor Profile Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/tutor-profile` | `tutor_profiles`, `tutor_topics`, `weekly_availability` | UC-4.1, 2.2.2 |
| `GET` | `/tutor-profile` | `tutor_profiles`, `tutor_topics`, `weekly_availability` | UC-4.1 |
| `PUT` | `/tutor-profile` | `tutor_profiles`, `tutor_topics`, `weekly_availability` | UC-4.1 |
| `PATCH` | `/tutor-profile/mode` | `tutor_profiles` | UC-4.3, 2.2.2 |
| `GET` | `/tutor-profile/availability` | `weekly_availability` | UC-4.2 |
| `PUT` | `/tutor-profile/availability` | `weekly_availability` | UC-4.2 |

### Tutee Request Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/requests` | `tutoring_requests`, `learning_needs` | UC-3.1, UC-3.2, 2.2.3 |
| `GET` | `/requests` | `tutoring_requests` | UC-3.1, 2.11 |
| `GET` | `/requests/{id}` | `tutoring_requests`, `learning_needs` | UC-3.1 |
| `PATCH` | `/requests/{id}` | `tutoring_requests`, `learning_needs` | UC-3.6 (broaden criteria) |
| `DELETE` | `/requests/{id}` | `tutoring_requests` | UC-3.7 (cancel request) |
| `GET` | `/tutor/requests/incoming` | `tutoring_requests` | UC-4.4 (tutor view) |

### Matching Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/matching/recommendations` | `tutor_profiles`, `tutor_topics`, `weekly_availability`, `workload`, `tutor_reliability_metrics`, `matching_scores` | UC-3.3, 2.5 |

### Session Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/sessions` | `tutoring_sessions` | 2.11 — query params: `?role=tutee` (filter `tutee_id = current user`), `?role=tutor` (filter `tutor_id = current user`), `?status=upcoming\|pending\|past\|cancelled` (filter by session state group) |
| `GET` | `/sessions/{id}` | `tutoring_sessions`, `learning_needs`, `venues` | 2.11 |
| `POST` | `/sessions/{id}/accept` | `tutoring_sessions` | UC-4.5, 2.7 |
| `POST` | `/sessions/{id}/decline` | `tutoring_sessions`, `notifications` | UC-4.6, 2.7 |
| `POST` | `/sessions/{id}/propose-slots` | `tutoring_sessions` | UC-4.7, 2.7 |
| `POST` | `/sessions/{id}/confirm-slot` | `tutoring_sessions` | UC-5.2, 2.7 |
| `POST` | `/sessions/{id}/cancel` | `tutoring_sessions`, `notifications` | UC-3.7, 2.9.4 |
| `PATCH` | `/sessions/{id}/outcome` | `tutoring_sessions`, `tutor_reliability_metrics`, `workload` | UC-6.3, UC-6.4, 2.9.4 |
| `POST` | `/sessions/{id}/venue` | `tutoring_sessions`, `venues` | UC-5.3, UC-5.4 |

### Messaging Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/sessions/{id}/messages` | `session_messages`, `messaging_channels` | UC-5.1, 2.6 |
| `POST` | `/sessions/{id}/messages` | `session_messages`, `messaging_channels` | UC-5.1, 2.6 |

### Venue Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/venues/recommend` | `venues` + OneMap API | UC-5.3, 2.8 |
| `GET` | `/venues/{id}` | `venues` | UC-5.3 |

### Payment Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/payments/fee` | `tutoring_sessions` | UC-6.2, 2.9.3 |
| `POST` | `/payments/initiate` | `payment_transactions`, `tutoring_sessions` | UC-6.1, 2.9.3 |
| `GET` | `/payments/{session_id}` | `payment_transactions` | UC-6.1 |

### Ratings Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/sessions/{id}/rating` | `tutor_ratings`, `tutor_reviews`, `tutor_reliability_metrics` | UC-6.5, 2.9.4 |
| `GET` | `/sessions/{id}/rating` | `tutor_ratings`, `tutor_reviews` | UC-6.5 |

### Complaints Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/complaints` | `complaints` | UC-7.1, 2.10.5 |
| `GET` | `/complaints` | `complaints` | UC-7.3 (admin) |
| `GET` | `/complaints/{id}` | `complaints`, `complaint_actions` | UC-7.3 |
| `POST` | `/complaints/{id}/action` | `complaint_actions`, `disciplinary_records` | UC-7.3 |

### Penalty Appeals Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `POST` | `/appeals` | `penalty_appeals` | UC-7.2, 2.10.6 |
| `GET` | `/appeals` | `penalty_appeals` | UC-7.4 (admin) |
| `GET` | `/appeals/{id}` | `penalty_appeals`, `disciplinary_records` | UC-7.4 |
| `PATCH` | `/appeals/{id}` | `penalty_appeals`, `disciplinary_records` | UC-7.4 (admin decide) |

### Admin Analytics Module

| Method | Path | Supabase Tables | Requirement |
|--------|------|-----------------|-------------|
| `GET` | `/admin/overview` | `users`, `tutor_profiles`, `tutoring_sessions`, `tutor_ratings` | UC-8.1, 2.10 |
| `GET` | `/admin/analytics/demand` | `tutoring_requests`, `learning_needs` | UC-8.2, 2.10 |
| `GET` | `/admin/analytics/supply` | `tutor_profiles`, `tutoring_sessions`, `workload` | UC-8.3, 2.10 |
| `GET` | `/admin/analytics/gaps` | `tutoring_requests`, `tutor_profiles` | UC-8.4, 2.10 |
| `GET` | `/admin/analytics/export` | Multiple tables | UC-8.5, 2.10 |
| `GET` | `/admin/matching/weights` | `admin_weights` | 2.5.3 |
| `PUT` | `/admin/matching/weights` | `admin_weights` | 2.5.3 |

---

## 3 — Supabase Tables

### Auth & Users

```sql
-- Auth & identity
users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,           -- [A-Za-z \-'], 1–100 chars
  email               text UNIQUE NOT NULL,    -- must end .edu.sg
  preferred_language  text NOT NULL,           -- English | Chinese | Malay | Tamil
  roles               text[] DEFAULT '{}',     -- ['tutee'] | ['tutor'] | ['tutee','tutor'] | ['admin']
  is_active           bool DEFAULT false,      -- true after email verified
  is_locked           bool DEFAULT false,      -- true after 5 failed login attempts
  failed_attempts     int DEFAULT 0,
  locked_at           timestamptz,
  created_at          timestamptz DEFAULT now()
)

-- Password storage (separate from users for principle of least privilege)
user_credentials (
  user_id             uuid PRIMARY KEY REFERENCES users(id),
  password_hash       text NOT NULL,
  updated_at          timestamptz DEFAULT now()
)

-- Email verification tokens
email_verifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id),
  token               text UNIQUE NOT NULL,
  expires_at          timestamptz NOT NULL,
  used_at             timestamptz,
  created_at          timestamptz DEFAULT now()
)

-- Password reset tokens
password_resets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id),
  token               text UNIQUE NOT NULL,
  expires_at          timestamptz NOT NULL,    -- 1 hour after creation
  used_at             timestamptz,
  created_at          timestamptz DEFAULT now()
)

-- Sign-in audit log
audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id),
  email               text NOT NULL,
  ip_address          text,
  event_type          text NOT NULL,           -- login_success | login_failure | password_reset | etc.
  outcome             text NOT NULL,           -- success | failure
  failure_reason      text,                    -- wrong_password | unverified | locked | invalid_domain
  created_at          timestamptz DEFAULT now()
)
```

### Tutor Profile

```sql
tutor_profiles (
  user_id                  uuid PRIMARY KEY REFERENCES users(id),
  academic_levels          text[] NOT NULL,    -- Primary|Secondary|Junior College|Polytechnic|ITE|University
  subjects                 text[] NOT NULL,
  planning_areas           text[] NOT NULL,
  accessibility_capabilities text[] DEFAULT '{}',
  accessibility_notes      text,               -- 1–100 chars
  max_weekly_hours         int NOT NULL,       -- 2|3|5|8|10
  is_active_mode           bool DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
)

-- Topics per subject (normalised)
tutor_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    uuid REFERENCES users(id),
  subject     text NOT NULL,
  topic       text NOT NULL,                   -- 1–100 chars, [A-Za-z0-9 \-']
  UNIQUE(tutor_id, subject, topic)
)

-- Weekly availability grid (day × hour slots)
weekly_availability (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     uuid REFERENCES users(id),
  day_of_week  int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun … 6=Sat
  hour_slot    int NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
  UNIQUE(tutor_id, day_of_week, hour_slot)
)

-- Weekly workload tracking (Confirmed sessions only)
workload (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        uuid REFERENCES users(id),
  week_start      date NOT NULL,
  confirmed_hours numeric DEFAULT 0,
  UNIQUE(tutor_id, week_start)
)

-- Tutor reliability metrics (updated after each completed session)
tutor_reliability_metrics (
  tutor_id        uuid PRIMARY KEY REFERENCES users(id),
  total_sessions  int DEFAULT 0,
  no_shows        int DEFAULT 0,
  avg_rating      numeric DEFAULT 0,
  score           numeric DEFAULT 100,         -- 0–100, used in matching
  updated_at      timestamptz DEFAULT now()
)
```

### Tutoring Requests & Matching

```sql
tutoring_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutee_id            uuid REFERENCES users(id),
  academic_level      text NOT NULL,
  subjects            text[] NOT NULL,
  topics              text[] NOT NULL,
  planning_areas      text[] NOT NULL,
  accessibility_needs text[] DEFAULT '{}',
  accessibility_notes text,                    -- 1–256 chars
  time_slots          jsonb NOT NULL,          -- [{date, hour_slot}]
  duration_hours      int NOT NULL CHECK (duration_hours IN (1,2,4)),
  urgency_category    text NOT NULL,           -- assignment_due|exam_soon|general_study
  urgency_level       text NOT NULL,           -- very_urgent|urgent|normal
  status              text DEFAULT 'open',     -- open|matched|cancelled
  created_at          timestamptz DEFAULT now()
)

-- Structured learning need derived from request
learning_needs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid REFERENCES tutoring_requests(id),
  urgency_level       text NOT NULL,
  unfulfilled_count   int DEFAULT 0,           -- incremented on each re-request
  created_at          timestamptz DEFAULT now()
)

-- Matching scores (one row per candidate tutor per request)
matching_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES tutoring_sessions(id),
  tutor_id        uuid REFERENCES users(id),
  score           numeric NOT NULL,            -- 0–100
  components_json jsonb,                       -- breakdown per scoring dimension
  computed_at     timestamptz DEFAULT now()
)

-- Admin-configurable matching weights
admin_weights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name  text UNIQUE NOT NULL,        -- rating|reliability|topic_overlap|distance|workload_fairness
  weight_value    numeric NOT NULL CHECK (weight_value >= 0),
  updated_at      timestamptz DEFAULT now()
)
```

### Sessions

```sql
tutoring_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid REFERENCES tutoring_requests(id),
  tutee_id          uuid REFERENCES users(id),
  tutor_id          uuid REFERENCES users(id),
  status            text NOT NULL DEFAULT 'pending_tutor_selection',
                    -- pending_tutor_selection|tutor_accepted|pending_confirmation
                    -- |confirmed|completed_attended|completed_no_show|cancelled
  duration_hours    int NOT NULL CHECK (duration_hours IN (1,2,4)),
  academic_level    text NOT NULL,
  venue_id          uuid REFERENCES venues(id),
  venue_manual      text,                      -- free text if no venue record
  scheduled_at      timestamptz,
  fee               numeric,                   -- locked at pending_confirmation entry
  outcome_tutor     text,                      -- attended|no_show (tutor's mark)
  outcome_tutee     text,                      -- attended|no_show (tutee's mark)
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
)

-- Messaging channel per session
messaging_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid UNIQUE REFERENCES tutoring_sessions(id),
  is_readonly  bool DEFAULT false,
  is_suspended bool DEFAULT false,
  created_at   timestamptz DEFAULT now()
)

-- Messages within a channel
session_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid REFERENCES messaging_channels(id),
  sender_id    uuid REFERENCES users(id),
  content      text NOT NULL,                  -- contact info stripped before store
  sent_at      timestamptz DEFAULT now(),
  is_read      bool DEFAULT false
)
```

### Payment & Review

```sql
payment_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              uuid REFERENCES tutoring_sessions(id),
  amount                  numeric NOT NULL,
  status                  text NOT NULL,       -- pending|success|failed|refunded
  provider_transaction_id text,
  created_at              timestamptz DEFAULT now()
)

tutor_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid UNIQUE REFERENCES tutoring_sessions(id),
  tutee_id    uuid REFERENCES users(id),
  tutor_id    uuid REFERENCES users(id),
  stars       int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  standout_traits text[] DEFAULT '{}',
  is_anonymous bool DEFAULT false,
  created_at  timestamptz DEFAULT now()
)

tutor_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id   uuid UNIQUE REFERENCES tutor_ratings(id),
  review_text text NOT NULL,                   -- [A-Za-z0-9 \-'], 1–500 chars
  created_at  timestamptz DEFAULT now()
)
```

### Venue

```sql
venues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  address               text NOT NULL,
  planning_area         text NOT NULL,
  lat                   numeric NOT NULL,      -- NEVER exposed to frontend
  lng                   numeric NOT NULL,      -- NEVER exposed to frontend
  accessibility_features text[] DEFAULT '{}',
  venue_type            text NOT NULL,         -- library|community_centre|study_area
  opening_hours         jsonb,                 -- {mon: "09:00-21:00", ...}
  source                text                   -- onemap|nlb|cc
)
```

### Notifications

```sql
notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id),
  type        text NOT NULL,                   -- session_update|payment|tutor_response|admin_alert
  title       text NOT NULL,
  content     text NOT NULL,
  is_read     bool DEFAULT false,
  is_mandatory bool DEFAULT false,             -- mandatory types cannot be opted out
  created_at  timestamptz DEFAULT now()
)
```

### Admin — Complaints & Penalties

```sql
complaints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid REFERENCES users(id),
  session_id   uuid REFERENCES tutoring_sessions(id),
  category     text NOT NULL,                  -- misconduct|no_show|payment|other
  description  text NOT NULL,                  -- [A-Za-z0-9 \-'], 1–500 chars
  status       text DEFAULT 'open',            -- open|under_review|resolved|dismissed
  created_at   timestamptz DEFAULT now()
)

complaint_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid REFERENCES complaints(id),
  admin_id     uuid REFERENCES users(id),
  action       text NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now()
)

disciplinary_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id),
  complaint_id    uuid REFERENCES complaints(id),
  penalty_type    text NOT NULL,               -- warning|suspension|ban
  issued_at       timestamptz DEFAULT now(),
  appeal_deadline timestamptz NOT NULL         -- configurable window after issued_at
)

penalty_appeals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciplinary_record_id  uuid REFERENCES disciplinary_records(id),
  user_id                 uuid REFERENCES users(id),
  appeal_text             text NOT NULL,       -- [A-Za-z0-9 \-'], 1–500 chars
  status                  text DEFAULT 'pending',  -- pending|upheld|modified|revoked
  outcome_notes           text,
  decided_at              timestamptz,
  submitted_at            timestamptz DEFAULT now()
)
```

---

## 4 — Implementation Order (Backend)

Build phases in strict order. Do NOT start Phase N+1 until all Phase N routes have passing Pytest tests.

### Phase 0 — Scaffolding & Infrastructure
- `[ ]` Create Python FastAPI project: `backend/` with `requirements.txt`, `.env.example`, `main.py`
- `[ ]` Set up folder structure (see Section 5)
- `[ ]` `backend/app/core/config.py` — Pydantic Settings with all env vars
- `[ ]` `backend/app/db/supabase_client.py` — singleton Supabase Python client
- `[ ]` `backend/app/core/security.py` — JWT encode/decode (python-jose), access + refresh tokens
- `[ ]` `backend/app/core/deps.py` — `get_current_user` FastAPI dependency
- `[ ]` `backend/app/core/errors.py` — global exception handler (never leak DB errors)
- `[ ]` `backend/app/utils/validators.py` — reusable `.edu.sg` email validator, name regex, password rules
- `[ ]` `backend/app/utils/rate_limiter.py` — in-memory (or Redis) 3-req/hr rate limiter for email endpoints
- `[ ]` `backend/app/utils/contact_filter.py` — regex to detect+block phone numbers and emails in message content
- `[ ]` Pytest config + first smoke test (`GET /health` returns 200)
- `[ ]` Delete legacy Node.js backend skeleton (`backend/src/`, `backend/package.json`)

### Phase 1 — Auth (UC-1.1 → UC-1.6)
- `[ ]` `POST /auth/register` — validate name/email/password, hash password, create user (inactive), generate email verification token, send email (UC-1.1)
- `[ ]` `POST /auth/verify-email` — validate token expiry, activate user (UC-1.2)
- `[ ]` `POST /auth/resend-verification` — rate-limited 3/hr, regenerate token (UC-1.3, UC-1.6)
- `[ ]` `POST /auth/login` — validate domain, check verified, check locked, compare hash, increment/reset `failed_attempts`, write `audit_logs`, issue JWT (UC-1.4)
- `[ ]` `POST /auth/forgot-password` — rate-limited, generate 1hr reset token, send email (UC-1.5)
- `[ ]` `POST /auth/reset-password` — validate token, enforce password rules, unlock account (UC-1.5)
- `[ ]` `POST /auth/change-password` — auth required, validate current password server-side
- `[ ]` `POST /auth/refresh` — validate refresh token, issue new access token
- `[ ]` Pytest: all auth routes (happy path + all failure codes)

### Phase 2 — User Profile & Dashboard Shell (UC-2.1 → UC-2.3)
- `[ ]` `GET /users/me` — return user profile from JWT sub (UC-2.2)
- `[ ]` `PATCH /users/me` — update full_name, preferred_language (UC-2.2)
- `[ ]` `GET /users/me/privacy` / `PATCH /users/me/privacy` — notification + privacy prefs (UC-2.2)
- `[ ]` `GET /notifications` / `PATCH /notifications/{id}` / `POST /notifications/read-all` (UC-2.3)
- `[ ]` `GET /dashboard/summary` — session counts, pending actions, upcoming sessions (UC-2.1)
- `[ ]` `GET /dashboard/badges` — unread counts for notification/chat/tutoring badges (UC-2.1)
- `[ ]` Pytest: user + dashboard routes

### Phase 3 — Tutor Profile & Availability (UC-4.1 → UC-4.3)
- `[ ]` `POST /tutor-profile` — create profile, assign Tutor role, validate all mandatory fields (UC-4.1, 2.2.2)
- `[ ]` `GET /tutor-profile` — return tutor profile for authenticated tutor (UC-4.1)
- `[ ]` `PUT /tutor-profile` — update profile (UC-4.1)
- `[ ]` `PATCH /tutor-profile/mode` — toggle `is_active_mode` (UC-4.3)
- `[ ]` `GET /tutor-profile/availability` / `PUT /tutor-profile/availability` — weekly grid (UC-4.2)
- `[ ]` Pytest: tutor profile routes

### Phase 4 — Tutee Request & Matching Engine (UC-3.1 → UC-3.6, UC-4.4 → UC-4.7, 2.5)
- `[ ]` `POST /requests` — create tutoring request, assign Tutee role, compute urgency level, write `learning_needs` (UC-3.1, UC-3.2, 2.2.3, 2.3)
- `[ ]` `GET /requests` — list requests for current user (tutee view) (UC-3.1)
- `[ ]` `PATCH /requests/{id}` — broaden criteria, re-run matching (UC-3.6)
- `[ ]` `DELETE /requests/{id}` — cancel request, set status=cancelled (UC-3.7)
- `[ ]` `GET /tutor/requests/incoming` — list pending requests for current tutor (UC-4.4)
- `[ ]` `backend/app/services/matching_service.py` — candidate pool filter + scoring (0–100) + fairness cap (2.5.1–2.5.3)
- `[ ]` `GET /matching/recommendations` — run matching engine, persist `matching_scores`, return ranked list with distance buckets (UC-3.3, 2.5.4)
- `[ ]` `backend/app/services/location_service.py` — planning area centroid lookup, distance bucket computation (2.4)
- `[ ]` Pytest: request CRUD + matching algorithm unit tests (scoring, fairness, empty-pool edge case)

### Phase 5 — Session Coordination (UC-4.5 → UC-5.5, 2.7, 2.8)
- `[ ]` `POST /sessions/{id}/accept` — tutor accepts, status → tutor_accepted, create messaging_channel, notify tutee (UC-4.5)
- `[ ]` `POST /sessions/{id}/decline` — status → cancelled, notify tutee (UC-4.6)
- `[ ]` `POST /sessions/{id}/propose-slots` — tutor proposes time slots from tutee list (UC-4.7)
- `[ ]` `POST /sessions/{id}/confirm-slot` — tutee confirms slot, status → pending_confirmation (UC-5.2)
- `[ ]` `GET /sessions/{id}/messages` / `POST /sessions/{id}/messages` — messaging with contact-info filter (UC-5.1, 2.6)
- `[ ]` `backend/app/services/venue_service.py` — call OneMap API, score venues, return planning_area + distance_bucket only (UC-5.3, 2.8)
- `[ ]` `GET /venues/recommend` — recommend venues after tutor_accepted state (UC-5.3)
- `[ ]` `POST /sessions/{id}/venue` — confirm selected or manual venue (UC-5.3, UC-5.4)
- `[ ]` `POST /sessions/{id}/cancel` — cancel with reason, read-only messaging, notifications (UC-3.7, 2.9.4)
- `[ ]` Pytest: session state machine transitions, messaging filter, venue recommendation

### Phase 6 — Payment & Session Completion (UC-6.1 → UC-6.6, 2.9.3, 2.9.4)
- `[ ]` `GET /payments/fee` — compute fee = base_rate[academic_level] × duration_hours, NEVER accept fee from client (UC-6.2, 2.9.3)
- `[ ]` `POST /payments/initiate` — check slot availability, check load cap, lock fee, create payment_transaction, status → confirmed on success (UC-6.1, 2.9.2, 2.9.3)
- `[ ]` `PATCH /sessions/{id}/outcome` — record outcome_tutor / outcome_tutee, determine final status, handle no-show refund logic, update workload + reliability (UC-6.3, UC-6.4, 2.9.4)
- `[ ]` `POST /sessions/{id}/rating` — validate stars/traits/review, update tutor_reliability_metrics, update topic demand analytics (UC-6.5, 2.9.4)
- `[ ]` `GET /sessions/{id}/rating` — fetch rating for session (UC-6.5)
- `[ ]` `GET /payments/{session_id}` — fetch payment status (UC-6.1)
- `[ ]` Pytest: fee computation, payment flow, outcome state transitions, no-show refund

### Phase 7 — Complaints & Appeals (UC-7.1 → UC-7.4, 2.10.5, 2.10.6)
- `[ ]` `POST /complaints` — validate description, create complaint record, notify admin (UC-7.1)
- `[ ]` `GET /complaints` / `GET /complaints/{id}` — admin filtered list + detail view (UC-7.3)
- `[ ]` `POST /complaints/{id}/action` — admin records action, creates disciplinary_record (UC-7.3)
- `[ ]` `POST /appeals` — validate text, check appeal_deadline, create penalty_appeal, notify admin (UC-7.2)
- `[ ]` `GET /appeals` / `GET /appeals/{id}` — admin pending appeals list + detail (UC-7.4)
- `[ ]` `PATCH /appeals/{id}` — admin decides outcome, records decision, notifies user (UC-7.4)
- `[ ]` Pytest: complaint + appeal lifecycle

### Phase 8 — Admin Analytics & Export (UC-8.1 → UC-8.5, 2.10)
- `[ ]` `GET /admin/overview` — KPI aggregates, alerts, top subjects (UC-8.1)
- `[ ]` `GET /admin/analytics/demand` — requests by subject, trending topics, by planning area (UC-8.2)
- `[ ]` `GET /admin/analytics/supply` — tutor counts, workload bands, tutors by subject (UC-8.3)
- `[ ]` `GET /admin/analytics/gaps` — shortage %, supply vs demand, recommendations (UC-8.4)
- `[ ]` `GET /admin/analytics/export` — CSV/Excel export with active filters (UC-8.5)
- `[ ]` `GET /admin/matching/weights` / `PUT /admin/matching/weights` — configurable scoring weights (2.5.3)
- `[ ]` Pytest: analytics aggregation logic

---

## 5 — File Structure (Backend)

```
backend/
├── main.py                          # FastAPI app factory, router registration, CORS, error handlers
├── .env                             # gitignored — copy from .env.example
├── .env.example                     # committed — template with all required keys
├── requirements.txt                 # pinned versions
│
└── app/
    ├── api/
    │   └── routes/
    │       ├── auth.py              # /auth/*
    │       ├── users.py             # /users/*
    │       ├── dashboard.py         # /dashboard/*
    │       ├── notifications.py     # /notifications/*
    │       ├── tutor_profile.py     # /tutor-profile/*
    │       ├── requests.py          # /requests/*
    │       ├── matching.py          # /matching/*
    │       ├── sessions.py          # /sessions/*
    │       ├── venues.py            # /venues/*
    │       ├── payments.py          # /payments/*
    │       ├── ratings.py           # /sessions/{id}/rating
    │       ├── messaging.py         # /sessions/{id}/messages
    │       ├── complaints.py        # /complaints/*
    │       ├── appeals.py           # /appeals/*
    │       └── admin.py             # /admin/*
    │
    ├── core/
    │   ├── config.py                # Pydantic BaseSettings — all env var declarations
    │   ├── security.py              # JWT encode/decode, password hashing (passlib)
    │   └── deps.py                  # get_current_user, get_admin_user FastAPI dependencies
    │
    ├── models/                      # Pydantic v2 request + response schemas
    │   ├── auth.py
    │   ├── user.py
    │   ├── tutor_profile.py
    │   ├── request.py
    │   ├── session.py
    │   ├── matching.py
    │   ├── venue.py
    │   ├── payment.py
    │   ├── message.py
    │   ├── rating.py
    │   ├── notification.py
    │   ├── complaint.py
    │   └── admin.py
    │
    ├── services/                    # Pure business logic — no direct DB calls here
    │   ├── auth_service.py          # token generation, email sending, rate limit checks
    │   ├── user_service.py
    │   ├── tutor_profile_service.py
    │   ├── request_service.py       # urgency computation, learning need derivation
    │   ├── matching_service.py      # candidate pool, scoring, fairness cap
    │   ├── session_service.py       # state machine transitions, conflict resolution
    │   ├── messaging_service.py     # contact info filter, channel read-only toggle
    │   ├── venue_service.py         # OneMap API call, venue scoring, distance bucketing
    │   ├── payment_service.py       # fee computation, payment flow
    │   ├── rating_service.py        # post-session rating + reliability update
    │   ├── notification_service.py  # create/dispatch notifications
    │   ├── complaint_service.py
    │   ├── appeal_service.py
    │   └── analytics_service.py     # aggregation queries, CSV/Excel export
    │
    ├── db/                          # All Supabase queries — one file per domain
    │   ├── supabase_client.py       # singleton client init
    │   ├── users_db.py
    │   ├── auth_db.py
    │   ├── tutor_profile_db.py
    │   ├── requests_db.py
    │   ├── matching_db.py
    │   ├── sessions_db.py
    │   ├── messaging_db.py
    │   ├── venues_db.py
    │   ├── payments_db.py
    │   ├── ratings_db.py
    │   ├── notifications_db.py
    │   ├── complaints_db.py
    │   ├── appeals_db.py
    │   └── analytics_db.py
    │
    └── utils/
        ├── validators.py            # edu_sg_email_validator, name_regex, password_rules
        ├── rate_limiter.py          # 3-req/hr per email for resend + forgot-password
        └── contact_filter.py        # strip phone numbers + emails from message content

tests/
├── conftest.py                      # Pytest fixtures (test DB client, auth tokens)
├── unit/
│   ├── test_validators.py
│   ├── test_matching_service.py     # scoring formula, fairness cap
│   ├── test_fee_computation.py
│   ├── test_contact_filter.py
│   └── test_session_state_machine.py
└── integration/
    ├── test_auth.py
    ├── test_tutor_profile.py
    ├── test_requests.py
    ├── test_matching.py
    ├── test_sessions.py
    ├── test_payments.py
    ├── test_ratings.py
    ├── test_complaints.py
    └── test_admin_analytics.py
```

### `requirements.txt` (pinned at project creation — update versions as needed)
```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
supabase>=2.4.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
pydantic>=2.7.0
pydantic-settings>=2.2.0
python-multipart>=0.0.9
httpx>=0.27.0        # for OneMap + Google Maps API calls
pandas>=2.2.0        # for CSV/Excel export
openpyxl>=3.1.2      # for Excel export
pytest>=8.2.0
pytest-asyncio>=0.23.0
pytest-httpx>=0.30.0
```

### `.env.example`
```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # backend only — never expose to frontend

# JWT
JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Email (SMTP or transactional provider)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@peerlearn.edu.sg
FRONTEND_URL=http://localhost:5173   # used in verification link URLs

# OneMap API
ONEMAP_API_KEY=

# Google Maps API (internal distance only — never expose to frontend)
GOOGLE_MAPS_API_KEY=

# Fee schedule (per academic level per hour, in SGD)
FEE_PRIMARY=10
FEE_SECONDARY=12
FEE_JUNIOR_COLLEGE=15
FEE_POLYTECHNIC=15
FEE_ITE=12
FEE_UNIVERSITY=18

# Session coordination timeouts (in hours)
TUTOR_RESPONSE_WINDOW_HOURS=48
TUTEE_CONFIRM_WINDOW_HOURS=24

# Penalty appeal window (in days)
APPEAL_WINDOW_DAYS=7

# Rate limiting (requests per hour per email)
RATE_LIMIT_EMAIL_MAX=3
```

---

## 6 — External API Integration Plan

### OneMap API (Singapore Government)
- **Used for**: venue recommendation (UC-5.3, Req 2.8), planning area centroid lookup (Req 2.4)
- **Called from**: `backend/app/services/venue_service.py` only
- **Endpoints used**:
  - `GET https://www.onemap.gov.sg/api/common/elastic/search` — search venues by keyword/type
  - `GET https://www.onemap.gov.sg/api/public/popapi/getPlanningareaNames` — list of planning areas
- **Privacy rule**: `lat`/`lng` from OneMap are stored in `venues.lat`/`venues.lng` but **never returned in any API response to the frontend**. Frontend receives only `planning_area` (string) and `distance_bucket` (Near/Medium/Far).
- **Caching**: planning area centroids can be cached in memory at startup (rarely change).

### Google Maps API
- **Used for**: internal distance computation between two planning area centroids (Req 2.8.4.2–2.8.4.3)
- **Called from**: `backend/app/services/location_service.py` only — never from frontend
- **Endpoint used**: Distance Matrix API or Directions API
- **Privacy rule**: The computed numeric distance is immediately converted to a bucket (`Near` ≤ 5 km, `Medium` 5–15 km, `Far` > 15 km) and only the bucket label is returned to frontend. Raw coordinates and distances are never returned to any user.
- **Fallback**: If Google Maps API is unavailable, fall back to Haversine formula using stored centroids.

---

## 7 — Session State Machine Reference

```
Pending Tutor Selection  ──(tutor accepts)──────────────► Tutor Accepted
        │                                                        │
        │ (tutee cancels / no response)                         │ (tutor declines)
        ▼                                                        │
    Cancelled ◄──────────────────────────────────────────────────┘
                                                                 │ (tutee confirms slot)
                                                                 ▼
                                                    Pending Confirmation
                                                         │        │
                                                  (payment     (payment
                                                  success)     fails/timeout)
                                                         │        │
                                                         ▼        ▼
                                                     Confirmed  Cancelled
                                                         │
                                              (both mark outcome)
                                                    /         \
                                                   ▼           ▼
                                        Completed (Attended)   Completed (No-Show)
                                              [terminal]           [terminal]
```

**Auto-cancellation triggers**: tutor deactivates mode on Confirmed sessions (NOT triggered), payment timeout, load exceeded at payment, slot conflict at payment, no tutor response within `TUTOR_RESPONSE_WINDOW_HOURS`, tutee no confirm within `TUTEE_CONFIRM_WINDOW_HOURS`, no venue found, admin cancels.

**No-Show refund rules**:
- No-Show Tutee: 50% refund to tutee
- No-Show Tutor: 100% refund to tutee
- Disputed outcomes: escalate to admin complaint flow

---

## 8 — Coding Rules (Hard Rules)

1. **Email validation**: Every endpoint accepting an email uses the reusable `edu_sg_email_validator` from `app/utils/validators.py`. No inline domain checks.
2. **JWT auth**: All non-public routes use `get_current_user` from `app/core/deps.py`. Never trust user-supplied `user_id` in the body — always derive from token.
3. **Supabase client only**: All DB reads/writes go through `supabase.table(...).select/insert/update/delete`. No raw SQL except Supabase RPC for complex aggregation queries.
4. **Pydantic v2**: Use `model_validator(mode='after')`, `field_validator`, `model_config = ConfigDict(...)`. No deprecated `validator`.
5. **REST conventions**: `GET`=read, `POST`=create, `PUT/PATCH`=update, `DELETE`=delete. Nouns in URLs. Never `/getSession`.
6. **Never expose DB errors**: Catch all Supabase exceptions in route handlers, return clean HTTP error responses with standardised `{"detail": "..."}` bodies.
7. **Rate limiting on email endpoints**: `POST /auth/resend-verification` and `POST /auth/forgot-password` — max 3 requests per hour per email address.
8. **No personal contact info in messages**: `messaging_service.py` strips phone numbers and email addresses before storing or returning message content.
9. **Session fees are server-side only**: `GET /payments/fee` computes and returns the fee. The client NEVER sends a fee amount in the payment payload. Backend ignores any `fee` field in `POST /payments/initiate`.
10. **Coordinates never leave the backend**: `lat`/`lng` are stored in `venues` table but omitted from all Pydantic response models. Frontend only receives `planning_area` (string) and `distance_bucket` (enum: Near/Medium/Far).

---

## 9 — Frontend Fixes Required (SRS Mismatches)

These are bugs in existing frontend files that must be fixed before or during backend wiring.

| File | Issue | Fix Required | Status |
|------|-------|-------------|--------|
| `TuteeRequest.jsx` | Duration options: 30min/1hr/1.5hr/2hr | Replace with exactly 1h / 2h / 4h (SRS 2.2.3.6) | ✅ Fixed |
| `OfferToTutor.jsx` | Max weekly load options include 15h/20h | Replace with exactly 2h/3h/5h/8h/10h (SRS 2.2.2.8) | ✅ Fixed |
| `OfferToTutor.jsx` | Academic levels field completely missing | Add multi-select: Primary/Secondary/Junior College/Polytechnic/ITE/University (SRS 2.2.2.2) | ✅ Fixed |
| `FeedbackForm.jsx` | `maxLength={100}` on review textarea | Change to `maxLength={500}` (SRS 2.9.4.5.3.3) | ✅ Fixed |
| `AuthContext.jsx` | No `.edu.sg` validation before `signUp` | Client-side domain check added; FastAPI migration deferred to Phase 1 | ✅ Fixed |
| `DashboardLayout.jsx` | Badge counts hardcoded | Wire to `GET /dashboard/badges` | ⏳ Deferred to Phase 2 |

---

*End of plan.md — last updated 2026-03-16*
