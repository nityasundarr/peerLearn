# PeerLearn — Database & Environment Setup Guide

> **Audience**: Any teammate setting up the project from scratch.  
> **Time required**: ~30 minutes.  
> **Prerequisites**: A web browser, Python 3.11+, and `pip` installed.

---

## 1. Create a Supabase Project

### 1.1 Sign up / log in

1. Go to **[https://supabase.com](https://supabase.com)** and sign in (or create a free account).
2. Click **"New project"** from your dashboard.

### 1.2 Configure the project

| Field | Value |
|-------|-------|
| **Name** | `peerlearn` (or any name you like) |
| **Database Password** | Generate a strong password and **save it** — you'll need it if you ever connect directly via `psql` |
| **Region** | Singapore (`ap-southeast-1`) — closest to your users |
| **Plan** | Free tier is sufficient for development |

Click **"Create new project"** and wait ~2 minutes for provisioning.

### 1.3 Find your API keys

Once the project is ready, navigate to:

```
Supabase Dashboard → Your Project → Settings (gear icon) → API
```

You need three values:

| Variable | Where to find it | Description |
|----------|-----------------|-------------|
| `SUPABASE_URL` | **Project URL** box at the top | e.g. `https://xxxxxxxxxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | **Project API keys → anon / public** | Safe to expose to browser — used only for Supabase Auth helpers in the frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys → service_role** | ⚠️ **Secret** — bypasses Row Level Security. Backend only. Never commit or expose. |

> **Tip**: Keep this browser tab open — you'll paste these into `.env` in Step 5.

---

## 2. Run the Database Migration

### 2.1 Open the SQL Editor

In your Supabase project:

```
Dashboard → SQL Editor (left sidebar, looks like `</>`) → New query
```

### 2.2 Paste and run the migration

Copy the **entire** contents of `backend/supabase/migrations/001_initial_schema.sql` and paste it into the editor, then click **"Run"** (or press `Ctrl+Enter` / `Cmd+Enter`).

<details>
<summary>Full migration SQL (click to expand)</summary>

```sql
-- =============================================================================
-- PeerLearn — Initial Schema Migration
-- 001_initial_schema.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AUTH & USERS
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  email               text UNIQUE NOT NULL,
  preferred_language  text NOT NULL DEFAULT 'English',
  roles               text[] DEFAULT '{}',
  is_active           bool DEFAULT false,
  is_locked           bool DEFAULT false,
  failed_attempts     int DEFAULT 0,
  locked_at           timestamptz,
  show_full_name         bool DEFAULT true,
  show_planning_area     bool DEFAULT true,
  notify_session_updates bool DEFAULT true,
  notify_payment         bool DEFAULT true,
  notify_tutor_response  bool DEFAULT true,
  notify_admin_alerts    bool DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  email          text NOT NULL,
  ip_address     text,
  event_type     text NOT NULL,
  outcome        text NOT NULL,
  failure_reason text,
  created_at     timestamptz DEFAULT now()
);

-- VENUES (before tutoring_sessions)
CREATE TABLE IF NOT EXISTS venues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  address               text NOT NULL,
  planning_area         text NOT NULL,
  lat                   numeric NOT NULL,
  lng                   numeric NOT NULL,
  accessibility_features text[] DEFAULT '{}',
  venue_type            text NOT NULL CHECK (venue_type IN ('library','community_centre','study_area')),
  opening_hours         jsonb,
  source                text
);

-- TUTOR PROFILE
CREATE TABLE IF NOT EXISTS tutor_profiles (
  user_id                  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  academic_levels          text[] NOT NULL DEFAULT '{}',
  subjects                 text[] NOT NULL DEFAULT '{}',
  planning_areas           text[] NOT NULL DEFAULT '{}',
  accessibility_capabilities text[] DEFAULT '{}',
  accessibility_notes      text,
  max_weekly_hours         int NOT NULL DEFAULT 5 CHECK (max_weekly_hours IN (2,3,5,8,10)),
  is_active_mode           bool DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_topics (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  subject  text NOT NULL,
  topic    text NOT NULL,
  UNIQUE(tutor_id, subject, topic)
);

CREATE TABLE IF NOT EXISTS weekly_availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_slot   int NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
  UNIQUE(tutor_id, day_of_week, hour_slot)
);

CREATE TABLE IF NOT EXISTS workload (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  confirmed_hours numeric DEFAULT 0,
  UNIQUE(tutor_id, week_start)
);

CREATE TABLE IF NOT EXISTS tutor_reliability_metrics (
  tutor_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions int DEFAULT 0,
  no_shows       int DEFAULT 0,
  avg_rating     numeric DEFAULT 0,
  score          numeric DEFAULT 100,
  updated_at     timestamptz DEFAULT now()
);

-- REQUESTS & MATCHING
CREATE TABLE IF NOT EXISTS tutoring_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutee_id            uuid REFERENCES users(id) ON DELETE CASCADE,
  academic_level      text NOT NULL,
  subjects            text[] NOT NULL DEFAULT '{}',
  topics              text[] NOT NULL DEFAULT '{}',
  planning_areas      text[] NOT NULL DEFAULT '{}',
  accessibility_needs text[] DEFAULT '{}',
  accessibility_notes text,
  time_slots          jsonb NOT NULL DEFAULT '[]',
  duration_hours      int NOT NULL CHECK (duration_hours IN (1,2,4)),
  urgency_category    text NOT NULL CHECK (urgency_category IN ('assignment_due','exam_soon','general_study')),
  urgency_level       text NOT NULL CHECK (urgency_level IN ('very_urgent','urgent','normal')),
  status              text DEFAULT 'open' CHECK (status IN ('open','matched','cancelled')),
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_needs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid REFERENCES tutoring_requests(id) ON DELETE CASCADE,
  urgency_level     text NOT NULL,
  unfulfilled_count int DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_weights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name text UNIQUE NOT NULL,
  weight_value   numeric NOT NULL CHECK (weight_value >= 0),
  updated_at     timestamptz DEFAULT now()
);

-- SESSIONS
CREATE TABLE IF NOT EXISTS tutoring_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid REFERENCES tutoring_requests(id) ON DELETE SET NULL,
  tutee_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  tutor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending_tutor_selection'
                   CHECK (status IN (
                     'pending_tutor_selection','tutor_accepted','pending_confirmation',
                     'confirmed','completed_attended','completed_no_show','cancelled'
                   )),
  duration_hours int NOT NULL CHECK (duration_hours IN (1,2,4)),
  academic_level text NOT NULL,
  venue_id       uuid REFERENCES venues(id) ON DELETE SET NULL,
  venue_manual   text,
  scheduled_at   timestamptz,
  proposed_slots jsonb DEFAULT '[]',
  cancel_reason  text,
  fee            numeric,
  outcome_tutor  text CHECK (outcome_tutor IN ('attended','no_show')),
  outcome_tutee  text CHECK (outcome_tutee IN ('attended','no_show')),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messaging_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid UNIQUE REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  is_readonly  bool DEFAULT false,
  is_suspended bool DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES messaging_channels(id) ON DELETE CASCADE,
  sender_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  content    text NOT NULL,
  sent_at    timestamptz DEFAULT now(),
  is_read    bool DEFAULT false
);

CREATE TABLE IF NOT EXISTS matching_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  tutor_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  score           numeric NOT NULL,
  components_json jsonb,
  computed_at     timestamptz DEFAULT now()
);

-- PAYMENT & REVIEW
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              uuid REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  amount                  numeric NOT NULL,
  status                  text NOT NULL CHECK (status IN ('pending','success','failed','refunded')),
  provider_transaction_id text,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid UNIQUE REFERENCES tutoring_sessions(id) ON DELETE CASCADE,
  tutee_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  tutor_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  stars           int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  standout_traits text[] DEFAULT '{}',
  is_anonymous    bool DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id   uuid UNIQUE REFERENCES tutor_ratings(id) ON DELETE CASCADE,
  review_text text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  type         text NOT NULL,
  title        text NOT NULL,
  content      text NOT NULL,
  is_read      bool DEFAULT false,
  is_mandatory bool DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- COMPLAINTS & PENALTIES
CREATE TABLE IF NOT EXISTS complaints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES tutoring_sessions(id) ON DELETE SET NULL,
  category    text NOT NULL CHECK (category IN ('misconduct','no_show','payment','other')),
  description text NOT NULL,
  status      text DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','dismissed')),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS complaint_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid REFERENCES complaints(id) ON DELETE CASCADE,
  admin_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disciplinary_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  complaint_id    uuid REFERENCES complaints(id) ON DELETE SET NULL,
  penalty_type    text NOT NULL CHECK (penalty_type IN ('warning','suspension','ban')),
  issued_at       timestamptz DEFAULT now(),
  appeal_deadline timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS penalty_appeals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disciplinary_record_id uuid REFERENCES disciplinary_records(id) ON DELETE CASCADE,
  user_id                uuid REFERENCES users(id) ON DELETE CASCADE,
  appeal_text            text NOT NULL,
  status                 text DEFAULT 'pending' CHECK (status IN ('pending','upheld','modified','revoked')),
  outcome_notes          text,
  decided_at             timestamptz,
  submitted_at           timestamptz DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_email_verif_token    ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_tutor_topics_tutor   ON tutor_topics(tutor_id);
CREATE INDEX IF NOT EXISTS idx_availability_tutor   ON weekly_availability(tutor_id);
CREATE INDEX IF NOT EXISTS idx_workload_tutor_week  ON workload(tutor_id, week_start);
CREATE INDEX IF NOT EXISTS idx_requests_tutee       ON tutoring_requests(tutee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutee       ON tutoring_sessions(tutee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutor       ON tutoring_sessions(tutor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status      ON tutoring_sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_channel     ON session_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_complaints_reporter  ON complaints(reporter_id);
CREATE INDEX IF NOT EXISTS idx_disc_records_user    ON disciplinary_records(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_user         ON penalty_appeals(user_id);
```

</details>

### 2.3 Verify tables were created

Run this query in the SQL Editor:

```sql
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
ORDER  BY table_name;
```

You should see **exactly these 26 tables**:

| # | Table |
|---|-------|
| 1 | admin_weights |
| 2 | audit_logs |
| 3 | complaint_actions |
| 4 | complaints |
| 5 | disciplinary_records |
| 6 | email_verifications |
| 7 | learning_needs |
| 8 | matching_scores |
| 9 | messaging_channels |
| 10 | notifications |
| 11 | password_resets |
| 12 | payment_transactions |
| 13 | penalty_appeals |
| 14 | session_messages |
| 15 | tutor_profiles |
| 16 | tutor_ratings |
| 17 | tutor_reliability_metrics |
| 18 | tutor_reviews |
| 19 | tutor_topics |
| 20 | tutoring_requests |
| 21 | tutoring_sessions |
| 22 | user_credentials |
| 23 | users |
| 24 | venues |
| 25 | weekly_availability |
| 26 | workload |

If any table is missing, re-run the migration. The `IF NOT EXISTS` clauses make it safe to run multiple times.

---

## 3. Set Up Row Level Security

> **Important note**: The FastAPI backend uses the **service_role key**, which bypasses RLS entirely. RLS is a defence-in-depth layer for any direct database access (e.g., Supabase client libraries used in the frontend, Supabase Studio browsing). It does **not** affect the backend's behaviour.

Run this entire block in the SQL Editor in a single query:

```sql
-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_topics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_availability      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workload                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_reliability_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutoring_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_needs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_weights            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutoring_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_channels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_ratings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints               ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinary_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_appeals          ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Helper function: check if the current JWT has the 'admin' role
-- =============================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND 'admin' = ANY(roles)
  );
$$;

-- =============================================================================
-- users — own row read/update; admins can read all
-- =============================================================================
CREATE POLICY "users_select_own"   ON users FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "users_update_own"   ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_insert_svc"   ON users FOR INSERT WITH CHECK (true);  -- backend service role only

-- =============================================================================
-- user_credentials — own row only (never exposed via API anyway)
-- =============================================================================
CREATE POLICY "creds_own" ON user_credentials FOR ALL USING (user_id = auth.uid());

-- =============================================================================
-- email_verifications / password_resets — own user only
-- =============================================================================
CREATE POLICY "email_verif_own"   ON email_verifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "pwd_resets_own"    ON password_resets     FOR ALL USING (user_id = auth.uid());

-- =============================================================================
-- audit_logs — admin read-all; individual users can see their own
-- =============================================================================
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (true);

-- =============================================================================
-- venues — public read (planning_area + type only; lat/lng guarded at API level)
-- =============================================================================
CREATE POLICY "venues_public_read"  ON venues FOR SELECT USING (true);
CREATE POLICY "venues_admin_write"  ON venues FOR ALL    USING (is_admin());

-- =============================================================================
-- tutor_profiles — active profiles visible to all authenticated users;
--                  only the tutor can update their own
-- =============================================================================
CREATE POLICY "tp_read_active"  ON tutor_profiles FOR SELECT
  USING (is_active_mode = true OR user_id = auth.uid() OR is_admin());
CREATE POLICY "tp_owner_write"  ON tutor_profiles FOR INSERT USING (user_id = auth.uid());
CREATE POLICY "tp_owner_update" ON tutor_profiles FOR UPDATE USING (user_id = auth.uid());

-- =============================================================================
-- tutor_topics, weekly_availability, workload — own tutor only
-- =============================================================================
CREATE POLICY "tt_own"   ON tutor_topics        FOR ALL USING (tutor_id = auth.uid());
CREATE POLICY "wa_own"   ON weekly_availability FOR ALL USING (tutor_id = auth.uid());
CREATE POLICY "wl_own"   ON workload            FOR ALL USING (tutor_id = auth.uid());

-- =============================================================================
-- tutor_reliability_metrics — own tutor read/write; public read (for matching display)
-- =============================================================================
CREATE POLICY "trm_read"  ON tutor_reliability_metrics FOR SELECT USING (true);
CREATE POLICY "trm_write" ON tutor_reliability_metrics FOR ALL    USING (tutor_id = auth.uid());

-- =============================================================================
-- tutoring_requests — own tutee read/write; admins read all
-- =============================================================================
CREATE POLICY "req_own"   ON tutoring_requests FOR ALL    USING (tutee_id = auth.uid());
CREATE POLICY "req_admin" ON tutoring_requests FOR SELECT USING (is_admin());

-- =============================================================================
-- learning_needs — readable by the tutee who owns the request; admins read all
-- =============================================================================
CREATE POLICY "needs_select" ON learning_needs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM tutoring_requests r WHERE r.id = request_id AND r.tutee_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY "needs_insert" ON learning_needs FOR INSERT WITH CHECK (true);
CREATE POLICY "needs_update" ON learning_needs FOR UPDATE USING (true);

-- =============================================================================
-- admin_weights — admin only
-- =============================================================================
CREATE POLICY "aw_admin" ON admin_weights FOR ALL USING (is_admin());
CREATE POLICY "aw_read"  ON admin_weights FOR SELECT USING (true);  -- matching engine needs to read

-- =============================================================================
-- tutoring_sessions — only tutee_id and tutor_id can access their own sessions
-- =============================================================================
CREATE POLICY "sess_participant" ON tutoring_sessions FOR SELECT
  USING (tutee_id = auth.uid() OR tutor_id = auth.uid() OR is_admin());
CREATE POLICY "sess_insert"  ON tutoring_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "sess_update"  ON tutoring_sessions FOR UPDATE
  USING (tutee_id = auth.uid() OR tutor_id = auth.uid() OR is_admin());

-- =============================================================================
-- messaging_channels — participants of the linked session
-- =============================================================================
CREATE POLICY "mc_participant" ON messaging_channels FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tutoring_sessions s
      WHERE s.id = session_id
        AND (s.tutee_id = auth.uid() OR s.tutor_id = auth.uid())
    )
    OR is_admin()
  );

-- =============================================================================
-- session_messages — only channel participants can read/write
-- =============================================================================
CREATE POLICY "msg_participant" ON session_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM messaging_channels mc
      JOIN tutoring_sessions s ON s.id = mc.session_id
      WHERE mc.id = channel_id
        AND (s.tutee_id = auth.uid() OR s.tutor_id = auth.uid())
    )
    OR is_admin()
  );

-- =============================================================================
-- matching_scores — session participants read; service role writes
-- =============================================================================
CREATE POLICY "ms_participant" ON matching_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tutoring_sessions s
      WHERE s.id = session_id
        AND (s.tutee_id = auth.uid() OR s.tutor_id = auth.uid())
    )
  );

-- =============================================================================
-- payment_transactions — only the tutee of the session can read
-- =============================================================================
CREATE POLICY "pt_tutee" ON payment_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tutoring_sessions s
      WHERE s.id = session_id AND s.tutee_id = auth.uid()
    )
    OR is_admin()
  );

-- =============================================================================
-- tutor_ratings / tutor_reviews — participants of the session
-- =============================================================================
CREATE POLICY "tr_select" ON tutor_ratings FOR SELECT
  USING (
    tutee_id = auth.uid() OR tutor_id = auth.uid() OR is_admin()
  );
CREATE POLICY "tr_insert" ON tutor_ratings FOR INSERT WITH CHECK (tutee_id = auth.uid());

CREATE POLICY "rev_select" ON tutor_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tutor_ratings r WHERE r.id = rating_id
        AND (r.tutee_id = auth.uid() OR r.tutor_id = auth.uid())
    )
  );
CREATE POLICY "rev_insert" ON tutor_reviews FOR INSERT WITH CHECK (true);

-- =============================================================================
-- notifications — only the recipient can read their own
-- =============================================================================
CREATE POLICY "notif_own"   ON notifications FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "notif_write" ON notifications FOR ALL    USING (true);  -- service role writes

-- =============================================================================
-- complaints — reporter can read own; admin can read all
-- =============================================================================
CREATE POLICY "comp_reporter" ON complaints FOR SELECT
  USING (reporter_id = auth.uid() OR is_admin());
CREATE POLICY "comp_insert"   ON complaints FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "ca_admin"  ON complaint_actions FOR ALL    USING (is_admin());
CREATE POLICY "ca_select" ON complaint_actions FOR SELECT USING (is_admin());

-- =============================================================================
-- disciplinary_records — the penalised user can read their own; admin all
-- =============================================================================
CREATE POLICY "dr_own"   ON disciplinary_records FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "dr_write" ON disciplinary_records FOR ALL    USING (is_admin());

-- =============================================================================
-- penalty_appeals — submitter can read own; admin can read all
-- =============================================================================
CREATE POLICY "pa_own"    ON penalty_appeals FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "pa_insert" ON penalty_appeals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "pa_update" ON penalty_appeals FOR UPDATE USING (is_admin());
```

---

## 4. Seed Required Data

Run this in the SQL Editor **after** the migration and RLS steps are complete.

### 4.1 Matching weights (required for the matching engine)

```sql
-- Default scoring weights — must sum to 1.0
INSERT INTO admin_weights (component_name, weight_value) VALUES
  ('rating',            0.25),
  ('reliability',       0.25),
  ('topic_overlap',     0.20),
  ('distance',          0.15),
  ('workload_fairness', 0.15)
ON CONFLICT (component_name) DO UPDATE SET
  weight_value = EXCLUDED.weight_value,
  updated_at   = now();

-- Verify: should return exactly 5 rows summing to 1.0
SELECT component_name, weight_value FROM admin_weights ORDER BY component_name;
SELECT ROUND(SUM(weight_value)::numeric, 4) AS total FROM admin_weights;
```

### 4.2 Create an admin user

The admin user is created via the **API** (not via direct SQL), so the password is properly hashed by the backend. Follow these steps:

**Step 1** — Start the backend (see Section 6 first), then register via the API:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Admin User",
    "email": "admin@test.edu.sg",
    "password": "Admin@1234",
    "preferred_language": "English"
  }'
```

**Step 2** — The user is inactive until email is verified. In dev mode (no SMTP configured), the verification link is logged to the terminal. Copy the token and call:

```bash
curl -X POST http://localhost:8000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "<paste_token_from_terminal_log>"}'
```

**Step 3** — Promote to admin in Supabase SQL Editor:

```sql
-- Replace the email with the one you registered above
UPDATE users
SET    roles = ARRAY['admin']
WHERE  email = 'admin@test.edu.sg';

-- Verify
SELECT id, full_name, email, roles FROM users WHERE email = 'admin@test.edu.sg';
```

### 4.3 Sample venues (Singapore libraries & community centres)

```sql
INSERT INTO venues (name, address, planning_area, lat, lng, venue_type, accessibility_features, opening_hours, source)
VALUES
  (
    'Clementi Public Library',
    '3155 Commonwealth Avenue West, #05-13/14/15, S129588',
    'Clementi',
    1.3150, 103.7650,
    'library',
    ARRAY['wheelchair_accessible', 'lift_access'],
    '{"mon":"10:00-21:00","tue":"10:00-21:00","wed":"10:00-21:00","thu":"10:00-21:00","fri":"10:00-21:00","sat":"10:00-21:00","sun":"10:00-21:00"}',
    'nlb'
  ),
  (
    'Jurong Regional Library',
    '21 Jurong East Central 1, S609732',
    'Jurong East',
    1.3334, 103.7425,
    'library',
    ARRAY['wheelchair_accessible', 'lift_access', 'hearing_loop'],
    '{"mon":"10:00-21:00","tue":"10:00-21:00","wed":"10:00-21:00","thu":"10:00-21:00","fri":"10:00-21:00","sat":"10:00-21:00","sun":"10:00-21:00"}',
    'nlb'
  ),
  (
    'Tampines Regional Library',
    '1 Tampines Walk, #03-04, Our Tampines Hub, S528523',
    'Tampines',
    1.3530, 103.9449,
    'library',
    ARRAY['wheelchair_accessible', 'lift_access'],
    '{"mon":"10:00-21:00","tue":"10:00-21:00","wed":"10:00-21:00","thu":"10:00-21:00","fri":"10:00-21:00","sat":"10:00-21:00","sun":"10:00-21:00"}',
    'nlb'
  ),
  (
    'Woodlands Regional Library',
    '900 South Woodlands Drive, #01-03, Woodlands Civic Centre, S730900',
    'Woodlands',
    1.4365, 103.7869,
    'library',
    ARRAY['wheelchair_accessible', 'lift_access'],
    '{"mon":"10:00-21:00","tue":"10:00-21:00","wed":"10:00-21:00","thu":"10:00-21:00","fri":"10:00-21:00","sat":"10:00-21:00","sun":"10:00-21:00"}',
    'nlb'
  ),
  (
    'Queenstown Community Centre',
    '920 Commonwealth Avenue, S149597',
    'Queenstown',
    1.2955, 103.7878,
    'community_centre',
    ARRAY['wheelchair_accessible'],
    '{"mon":"08:00-22:00","tue":"08:00-22:00","wed":"08:00-22:00","thu":"08:00-22:00","fri":"08:00-22:00","sat":"08:00-22:00","sun":"08:00-22:00"}',
    'cc'
  ),
  (
    'Bishan Community Club',
    '51 Bishan Street 13, S579799',
    'Bishan',
    1.3508, 103.8484,
    'community_centre',
    ARRAY['wheelchair_accessible', 'lift_access'],
    '{"mon":"09:00-22:00","tue":"09:00-22:00","wed":"09:00-22:00","thu":"09:00-22:00","fri":"09:00-22:00","sat":"09:00-22:00","sun":"09:00-22:00"}',
    'cc'
  );

-- Verify venues
SELECT name, planning_area, venue_type FROM venues ORDER BY planning_area;
```

---

## 5. Create `backend/.env`

Create the file `backend/.env` (this file is gitignored — never commit it):

```bash
# From the repo root:
cp backend/.env.example backend/.env
```

Then open `backend/.env` and fill in the values:

```dotenv
# ============================================================
# SUPABASE — paste from Dashboard → Settings → API
# ============================================================

# Project URL (e.g. https://xxxxxxxxxxxx.supabase.co)
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co

# Anon public key — safe for browser use, not sensitive
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Service role key — SECRET, bypasses RLS, backend only, never expose
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================================
# JWT — generate a strong random secret for signing tokens
# ============================================================

# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=replace_this_with_a_64_char_random_hex_string

JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ============================================================
# EMAIL — leave blank in development (verification links are
# logged to terminal instead of sent via email)
# ============================================================

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@peerlearn.edu.sg
FRONTEND_URL=http://localhost:5173

# ============================================================
# EXTERNAL APIS — optional for development
# OneMap: https://www.onemap.gov.sg/apidocs/apidocs
# Google Maps: https://console.cloud.google.com
# Both can be left blank — venue service falls back to local DB data
# ============================================================

ONEMAP_API_KEY=
GOOGLE_MAPS_API_KEY=

# ============================================================
# FEE SCHEDULE — SGD per hour per academic level
# ============================================================

FEE_PRIMARY=10
FEE_SECONDARY=12
FEE_JUNIOR_COLLEGE=15
FEE_POLYTECHNIC=15
FEE_ITE=12
FEE_UNIVERSITY=18

# ============================================================
# SESSION COORDINATION TIMEOUTS
# ============================================================

TUTOR_RESPONSE_WINDOW_HOURS=48
TUTEE_CONFIRM_WINDOW_HOURS=24

# ============================================================
# PENALTY APPEALS
# ============================================================

APPEAL_WINDOW_DAYS=7

# ============================================================
# RATE LIMITING
# ============================================================

RATE_LIMIT_EMAIL_MAX=3
```

> **Security checklist before committing anything**:
> - `backend/.env` is in `.gitignore` ✓
> - `SUPABASE_SERVICE_ROLE_KEY` never appears in any frontend file ✓
> - `JWT_SECRET_KEY` is a random string, not a word or phrase ✓

---

## 6. Verify Everything Works

Run these steps in order from your terminal.

### Step 1 — Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 2 — Start the backend

```bash
# Still inside backend/
uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process ...
```

### Step 3 — Check the health endpoint

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

Or open **[http://localhost:8000/docs](http://localhost:8000/docs)** in your browser — the Swagger UI should load and list all routes.

### Step 4 — Register a test user

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test Student",
    "email": "test@nus.edu.sg",
    "password": "TestPass@1",
    "preferred_language": "English"
  }'
```

Expected response (HTTP 201):
```json
{
  "message": "Account created successfully. Please check your email to verify your account before logging in."
}
```

In the terminal running uvicorn, look for a log line like:
```
INFO - [DEV EMAIL] To: test@nus.edu.sg | Subject: Verify your PeerLearn account | Verify URL: http://localhost:5173/verify-email?token=...
```

Copy the `token` value from the URL.

### Step 5 — Verify the email

```bash
curl -X POST http://localhost:8000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "PASTE_TOKEN_HERE"}'
```

Expected:
```json
{"message": "Email verified successfully. You can now log in."}
```

### Step 6 — Log in

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@nus.edu.sg", "password": "TestPass@1"}'
```

Expected: a JSON response containing `access_token`, `refresh_token`, and user info.

### Step 7 — Confirm the user in Supabase

1. Open your Supabase project → **Table Editor** (left sidebar)
2. Click on the **`users`** table
3. You should see the user with `email = test@nus.edu.sg` and `is_active = true`

---

## 7. Common Errors and Fixes

### ❌ `ValidationError: SUPABASE_URL field required`

**Cause**: The `.env` file is missing or in the wrong directory.  
**Fix**:
```bash
# Make sure you're in backend/ and the file exists
ls backend/.env        # should exist
head -1 backend/.env   # should show "# ============================================================"
```
If missing: `cp backend/.env.example backend/.env` and fill in the keys.

---

### ❌ `postgrest.exceptions.APIError: ... connection refused` or `supabase.exceptions.StorageException`

**Cause**: `SUPABASE_URL` is wrong or the project is still provisioning.  
**Fix**:
1. Check that `SUPABASE_URL` starts with `https://` and ends with `.supabase.co`
2. Log in to [supabase.com](https://supabase.com) and confirm the project status is **Active** (not Paused)
3. Free projects pause after 1 week of inactivity — click **"Restore project"** if needed

---

### ❌ `{"detail":"A database error occurred."}` on every request

**Cause**: RLS is blocking the service role key, or the key is wrong.  
**Diagnosis**: In the SQL Editor, run:
```sql
SELECT current_setting('request.jwt.claims', true);
```
If this errors, you're using the anon key instead of service_role.

**Fix**: Copy the **service_role** key (not the anon key) from:  
`Dashboard → Settings → API → service_role (secret)`  
Paste it into `SUPABASE_SERVICE_ROLE_KEY` in your `.env`.

---

### ❌ `{"detail":"Invalid or expired token."}` after logging in

**Cause**: `JWT_SECRET_KEY` in `.env` is empty, too short, or was changed after the token was issued.  
**Fix**:
1. Generate a proper secret: `python -c "import secrets; print(secrets.token_hex(32))"`
2. Paste it into `JWT_SECRET_KEY` in `.env`
3. Restart uvicorn — all previously issued tokens become invalid (log in again)

---

### ❌ `CORS policy: No 'Access-Control-Allow-Origin'`

**Cause**: The React frontend (running on `http://localhost:5173`) is blocked by the backend's CORS config.  
**Diagnosis**: Check that `FRONTEND_URL` in `.env` matches exactly the URL in your browser.  
**Fix**:
```dotenv
# In backend/.env — must match exactly what appears in the browser address bar
FRONTEND_URL=http://localhost:5173
```
Restart uvicorn after changing `.env`.

---

### ❌ Tables are missing after running the migration

**Cause**: The migration had an error partway through (check the SQL Editor for red error text).  
**Fix**: The migration uses `CREATE TABLE IF NOT EXISTS` throughout, so you can safely run it again. Common issues:
- `pgcrypto` extension not available → the first `CREATE EXTENSION` line should handle this; if not, contact your Supabase plan support
- A foreign key references a table that doesn't exist yet → ensure you run the **entire** SQL block, not just individual CREATE statements

---

### ❌ `422 Unprocessable Entity` on `POST /auth/register`

**Cause**: The email doesn't end in `.edu.sg`.  
**Fix**: Use an `.edu.sg` address in your test (e.g., `test@nus.edu.sg`, `student@ntu.edu.sg`). This restriction is intentional — see SRS 2.1.1.

---

### ❌ uvicorn `ModuleNotFoundError: No module named 'app'`

**Cause**: uvicorn was started from the wrong directory.  
**Fix**: Always `cd backend` first, then run `uvicorn main:app --reload` (not `uvicorn backend.main:app`).

---

*Last updated: 2026-03-16 — matches plan.md schema and Phase 0–8 implementation.*
