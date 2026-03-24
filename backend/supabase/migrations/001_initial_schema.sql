-- =============================================================================
-- PeerLearn — Initial Schema Migration
-- 001_initial_schema.sql
--
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query).
-- Tables are created in dependency order (no forward-reference errors).
-- =============================================================================

-- Enable the pgcrypto extension for gen_random_uuid() if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- AUTH & USERS
-- =============================================================================

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
  -- Privacy / notification preferences (UC-2.2)
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

-- =============================================================================
-- VENUES (created before tutoring_sessions which references it)
-- =============================================================================

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

-- =============================================================================
-- TUTOR PROFILE
-- =============================================================================

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

-- =============================================================================
-- TUTORING REQUESTS & MATCHING
-- =============================================================================

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

-- =============================================================================
-- SESSIONS (references tutoring_requests + users + venues)
-- =============================================================================

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
  proposed_slots jsonb DEFAULT '[]',  -- Phase 5 addition
  cancel_reason  text,               -- Phase 5 addition
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

-- =============================================================================
-- PAYMENT & REVIEW
-- =============================================================================

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

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

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

-- =============================================================================
-- ADMIN — COMPLAINTS & PENALTIES
-- =============================================================================

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

-- =============================================================================
-- INDEXES (performance for common query patterns)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX IF NOT EXISTS idx_email_verif_token        ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verif_user         ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token    ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_tutor_topics_tutor       ON tutor_topics(tutor_id);
CREATE INDEX IF NOT EXISTS idx_availability_tutor       ON weekly_availability(tutor_id);
CREATE INDEX IF NOT EXISTS idx_workload_tutor_week      ON workload(tutor_id, week_start);
CREATE INDEX IF NOT EXISTS idx_requests_tutee           ON tutoring_requests(tutee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutee           ON tutoring_sessions(tutee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutor           ON tutoring_sessions(tutor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status          ON tutoring_sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_channel         ON session_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user       ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread     ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_complaints_reporter      ON complaints(reporter_id);
CREATE INDEX IF NOT EXISTS idx_disc_records_user        ON disciplinary_records(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_user             ON penalty_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_record           ON penalty_appeals(disciplinary_record_id);
