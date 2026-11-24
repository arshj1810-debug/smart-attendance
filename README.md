# Smart Attendance Management System with Analytics and Real-Time Monitoring

React + Node.js/Express + PostgreSQL + Socket.IO. One project, three roles (Admin, Faculty, Student).

```
smart-attendance/
├─ backend/    Express REST API, PostgreSQL schema, QR/anti-replay, analytics engine, Socket.IO, demo seed
├─ frontend/   React (Vite) app: your supplied UI, now wired to the real API (no mock data left)
├─ docker-compose.yml   PostgreSQL 17 on localhost:5433
└─ package.json         one-command scripts
```

## Run it (about 3 minutes)

Requirements: Node.js 18+ and PostgreSQL (Docker is the easiest way to get one).

```bash
# 1. Database (skip if you already run PostgreSQL – see "Own PostgreSQL" below)
docker compose up -d db

# 2. Install everything
npm run setup

# 3. Start API (http://localhost:3200) + web app (http://localhost:3100)
npm run dev
```

Open **http://localhost:3100**. On first start the backend creates the database (if missing), creates all tables, and loads demo data: 18 students, 6 faculty, 9 courses, a weekly timetable, five weeks of attendance history, quizzes and notifications.

| Role | Email | Password |
|---|---|---|
| Admin | admin@college.edu | demo123 |
| Faculty | faculty@college.edu | demo123 |
| Student | student@college.edu | demo123 |

The login page also has one-click demo buttons. Demo student Arpit is deliberately at ~62% in Mathematics so the below-75% warnings are visible.

### Own PostgreSQL (e.g. your port 5433 install from the reports)
Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL=postgres://USER:PASSWORD@localhost:5433/smart_attendance`. The database is created automatically if your user is allowed to create databases.

### Check that everything works
With `npm run dev` running: `npm run smoke` runs 30 end-to-end checks (login, 401/403 rules, sessions, QR scan, replay/expiry/tamper rejection, manual marking, analytics, notifications).

### Single-process / production-style
```bash
npm run build     # builds the React app into frontend/dist
npm start         # the API now also serves the web app at http://localhost:3200
```
Before going live: set `JWT_SECRET` and `QR_SECRET` to long random values, set `SEED_DEMO=false` (this also disables the demo buttons; the first admin is then created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`), serve over HTTPS, and set `CORS_ORIGINS` if the web app is on another domain.

## What was built, mapped to your milestones

| Milestone | Delivered |
|---|---|
| 1 – Design | 3NF schema (users, courses, enrollments, sessions, records + timetable, notifications, quizzes, audit); JWT access + refresh tokens; REST API incl. `/auth/refresh`, `/sessions/create`, `/attendance/mark`, `/analytics/student/:id`; QR codes refresh every 2 s, HMAC-signed, expire and are single-use (DB primary key makes replay impossible); Socket.IO live dashboards |
| 2 – Backend | bcrypt hashing, JWT, role middleware, course/enrollment/session/attendance/analytics/report endpoints, `/api/health`, upserts so a student never gets two records per session |
| 3 – Integration & analytics | Every screen uses the API. Analytics engine: per-course and overall percentages, (Present + Late) ÷ recorded sessions, threshold flag (default 75%, admin-configurable), “classes needed to reach 75%”, faculty/admin trends, by-course/department/semester filters, generated reports with CSV export |
| 4 – Testing & hardening | Public registration can **never** create an Admin (off by default; Student only when enabled); no tokens logged; login rate limiting; parameterised SQL; ownership checks (faculty only their courses, students only their data); indexes and a unique `(session_id, student_id)` constraint; `npm run smoke` |
| 5 – Deployment | Docker database, single-process production mode, env-based secrets, health endpoint, seed/reset scripts |

### Behaviour worth knowing
* **Unmarked students are counted absent.** When a session starts, every enrolled student gets an *Absent* record, so a student who never scans is absent once the session ends. This closes the “unmarked sessions” limitation noted in Milestones 2 and 4. A running session does not lower anyone’s percentage until it ends, but a scan counts immediately.
* **Low-attendance alerts** are generated when a session ends: each student below the threshold gets a notification (max one per course per day), delivered live over Socket.IO.
* **Enrollment** is automatic when a student’s department and semester match a course; use Admin → Enrollments (or the Courses/Students pages) for exceptions.
* **Campus checks** (GPS geofence + IP ranges) are OFF by default so the app works anywhere. Admin → Settings turns them on. GPS is reported by the device and can be spoofed, so treat it as a deterrent. A QR code can also still be relayed by screen-share, as noted in Milestone 1.
* New accounts created by an admin get the password `Welcome@123` unless one is entered; ask users to change it in Settings.
* Camera scanning needs HTTPS or `localhost`. On a phone over your LAN, use the “enter code” fallback or serve the app over HTTPS.

## API summary (all under `/api`, JWT in `Authorization: Bearer …`)
`POST /auth/login · /auth/refresh · /auth/register(off) · /auth/change-password`, `GET /auth/me`, `PUT /auth/profile` ·
`GET /courses`, `GET /enrollments/my`, `GET|POST|DELETE /enrollments…` ·
`POST /sessions/create`, `GET /sessions/active|past`, `POST /sessions/:id/end`, `GET /sessions/:id/qr` ·
`POST /attendance/scan|mark`, `GET /attendance/me`, `GET /attendance/course/:courseId/report` ·
`GET /analytics/my|student/:id|overview` · `GET /faculty/overview|schedule|courses`, `GET /admin/overview` ·
`GET|POST|PUT|DELETE /admin/{students,faculty,courses,timetable,records}` (+ `/bulk` CSV import) · `GET /reports`, `GET /meta` ·
`GET|POST /notifications…`, `GET|POST|DELETE /quizzes…` · `GET|PUT /settings`, `GET|PUT /config` · `GET /audit` · `GET /health`

Socket.IO events: `session:changed`, `attendance:update` (staff), `attendance:changed` (the student), `notification:new`.

## Honest status
I could not install packages or run PostgreSQL in the environment where this was written, so the code has been syntax-checked and reviewed but **not executed end to end**. Run `npm run smoke` first; if any check fails, the message shows which endpoint, and the fix is usually one line. Not included: automated unit tests, email/SMS delivery of alerts, and cloud deployment (the setup is ready for it, but you must pick a host).
