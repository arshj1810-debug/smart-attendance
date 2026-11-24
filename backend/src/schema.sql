-- Smart Attendance Management System: PostgreSQL schema (3NF). Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS users (
  user_id       SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,                 -- roll number / faculty ID / admin ID (what the UI shows as "id")
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','faculty','student')),
  department    TEXT NOT NULL DEFAULT '',
  program       TEXT NOT NULL DEFAULT '',             -- degree programme (students)
  semester      INTEGER,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TABLE IF NOT EXISTS courses (
  course_id           SERIAL PRIMARY KEY,
  course_code         TEXT NOT NULL UNIQUE,
  course_name         TEXT NOT NULL,
  department          TEXT NOT NULL DEFAULT '',
  semester            INTEGER NOT NULL DEFAULT 1,
  assigned_faculty_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_faculty_idx ON courses (assigned_faculty_id);

CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id SERIAL PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id     INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS enrollments_course_idx ON enrollments (course_id);

CREATE TABLE IF NOT EXISTS timetable_slots (
  slot_id   SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  day       TEXT NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  time_slot TEXT NOT NULL,                            -- e.g. 09:00–09:50
  room      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS timetable_course_idx ON timetable_slots (course_id);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  session_id   SERIAL PRIMARY KEY,
  course_id    INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  faculty_id   INTEGER NOT NULL REFERENCES users(user_id),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_label   TEXT NOT NULL DEFAULT '',
  room         TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'Lecture',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_course_idx ON attendance_sessions (course_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_faculty_idx ON attendance_sessions (faculty_id, started_at DESC);
-- A faculty member can have only one live session at a time.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_faculty ON attendance_sessions (faculty_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS attendance_records (
  record_id  SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('Present','Absent','Late')),
  method     TEXT NOT NULL DEFAULT 'manual',          -- manual | qr
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS records_student_idx ON attendance_records (student_id);

CREATE TABLE IF NOT EXISTS qr_used_tokens (
  nonce      TEXT PRIMARY KEY,
  session_id INTEGER,
  student_id INTEGER,
  used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  audience       TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admin','faculty','student')),
  target_user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,   -- personal notification when set
  type           TEXT NOT NULL DEFAULT 'Announcement',
  created_by     INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_target_idx ON notifications (target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS quizzes (
  quiz_id      SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  course_id    INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  created_by   INTEGER NOT NULL REFERENCES users(user_id),
  duration_min INTEGER NOT NULL,
  deadline     TIMESTAMPTZ NOT NULL,
  questions    JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  student_id   INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers      JSONB NOT NULL DEFAULT '[]',
  submitted_at TIMESTAMPTZ,
  score        INTEGER,
  total        INTEGER,
  timed_out    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (quiz_id, student_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id     BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  type       TEXT NOT NULL,
  actor      TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_logs (at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Attendance entries that count towards percentages: every record of a finished session, plus
-- any non-Absent record of a live session (so a scan shows up immediately, but a running class
-- does not drag students down before it has ended).
CREATE OR REPLACE VIEW counted_attendance AS
SELECT r.record_id, r.student_id, r.status, s.session_id, s.course_id, s.session_date, s.started_at
FROM attendance_records r
JOIN attendance_sessions s ON s.session_id = r.session_id
WHERE s.ended_at IS NOT NULL OR r.status <> 'Absent';
