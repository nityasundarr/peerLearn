# PeerLearn

A peer tutoring platform for students across Singapore. Tutees submit tutoring requests, the system matches them with suitable tutors based on subject fit, location, availability, and reliability, and manages the full session lifecycle from booking through payment and completion.

---

## Demo

<!-- To add a demo video, upload it to YouTube or any video host and replace the link below -->
<!-- Example: [![Watch the demo](https://img.youtube.com/vi/YOUR_VIDEO_ID/0.jpg)](https://www.youtube.com/watch?v=YOUR_VIDEO_ID) -->

*Demo video coming soon.*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, React Router 7 |
| Backend | Python 3.13, FastAPI, Uvicorn |
| Database | Supabase (PostgreSQL) |
| Auth | JWT (PyJWT), bcrypt |
| Email | Gmail SMTP |
| Maps | OneMap API (Singapore) |

---

## Project Structure

```
peerLearn/
├── frontend/          # React SPA
│   └── src/
│       ├── pages/     # Route-level components (Dashboard, TuteeRequest, etc.)
│       ├── components/
│       └── services/  # Axios API client, AuthContext
└── backend/           # FastAPI application
    └── app/
        ├── api/routes/ # Route handlers
        ├── services/   # Business logic
        ├── db/         # Supabase query functions
        ├── models/     # Pydantic request/response schemas
        └── core/       # Config, auth deps, error handling
```

---

## Prerequisites

- Node.js 18+
- Python 3.13+
- A [Supabase](https://supabase.com) project with the database schema applied

> **Supabase schema:** Apply the SQL schema found in the Supabase dashboard or provided separately to your project before running the app. The backend will fail to start correctly if the required tables do not exist.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/nityasundarr/PeerLearn.git
cd PeerLearn
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# JWT
JWT_SECRET=your_jwt_secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail_address
SMTP_PASSWORD=your_gmail_app_password  # Use a Gmail App Password, not your account password
EMAIL_FROM=your_gmail_address

# OneMap API (for venue map embeds)
ONEMAP_EMAIL=your_onemap_email
ONEMAP_PASSWORD=your_onemap_password

# Fee schedule (SGD per hour)
FEE_PRIMARY=10
FEE_SECONDARY=12
FEE_JUNIOR_COLLEGE=15
FEE_POLYTECHNIC=15
FEE_ITE=12
FEE_UNIVERSITY=18

# Appeals
APPEAL_WINDOW_DAYS=7
```

> **Gmail App Password:** Go to your Google Account → Security → 2-Step Verification → App Passwords. Generate a password for "Mail" and use that as `SMTP_PASSWORD`. Your regular Gmail password will not work.

Start the backend:

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`. Interactive API docs (Swagger UI) at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Start the frontend:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Creating an Admin Account

There is no self-registration flow for admins. To create an admin user:

1. Register a normal account through the app.
2. In your Supabase dashboard, go to **Table Editor → users**.
3. Find the user's row and update the `roles` column to include `"admin"` (e.g. `["admin"]`).

That user can now log in and access the admin console at `/admin`.

---

## User Roles

| Role | Description |
|---|---|
| **Tutee** | Submits tutoring requests, selects tutors, confirms sessions, makes payments |
| **Tutor** | Sets up profile and availability, accepts/declines requests, proposes time slots |
| **Admin** | Reviews complaints, issues penalties, decides on appeals, monitors analytics |

---

## Key Features

- Automated tutor matching scored on subject fit, location, rating, reliability, and workload
- End-to-end session lifecycle: request → match → accept → slot confirmation → payment → completion
- Per-session messaging channel between tutor and tutee
- Complaints system with admin review, penalties, and tutor appeals
- In-app notifications for all key events
- Admin analytics dashboard with configurable matching weights

> **Note:** Payments are simulated — no real payment gateway is integrated. All payments are treated as immediately successful upon initiation.

---

## Running Tests

```bash
cd backend
pytest
```
