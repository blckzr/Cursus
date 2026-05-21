# Student Information System (SIS)

A centralized web application for managing students, faculty, courses, and grades in a higher-education setting. The core feature is an **Excel-like gradebook** that faculty use to manage assessments and scores, with a real-time read-only view for students.

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS | Vercel |
| Backend | Node.js + Express + TypeScript | Render |
| Database | PostgreSQL | Supabase |

---

## Repository Structure

```
/  (repo root)
├── apps/
│   ├── backend/          # Node.js + Express API
│   └── frontend/         # React SPA (Phase 3+)
├── migrations/
│   ├── schema.sql        # Clean schema — use this to set up the database
│   └── 001_initial_schema.sql  # Same schema + seed admin user
├── package.json          # Monorepo workspace root
└── README.md
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://www.npmjs.com/) v10 or higher
- A [Supabase](https://supabase.com/) account and project
- A [Render](https://render.com/) account (for deployment)
- A [Vercel](https://vercel.com/) account (for frontend deployment, later)

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd sis
```

### 2. Set up the database (Supabase)

1. Log in to [Supabase](https://supabase.com/) and open your project.
2. Go to **Project > SQL Editor > New query**.
3. Copy the contents of [`migrations/schema.sql`](migrations/schema.sql) and paste it into the editor.
4. Click **Run**.

> **Tip:** If you also want the seed admin user (`admin@sis.local` / `Admin@1234`), run [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql) instead. Change the password immediately after first login.

### 3. Get your Supabase connection strings

In your Supabase project, go to **Project Settings > Database > Connection string**.

You need two strings:

| Purpose | Where to find it | Port |
|---|---|---|
| App runtime (`DATABASE_URL`) | Connection Pooler → Transaction mode | `6543` |
| Migrations (run once) | Direct connection | `5432` |

### 4. Configure environment variables

```bash
cd apps/backend
cp .env.example .env
```

Open `.env` and fill in the values:

```env
# Supabase pooler connection string (port 6543, Transaction mode)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Generate a strong secret: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=8h

# Frontend URL (use localhost during development)
CLIENT_ORIGIN=http://localhost:5173

PORT=4000
NODE_ENV=development
```

### 5. Install dependencies

From the repo root:

```bash
npm install
```

Or directly in the backend:

```bash
cd apps/backend
npm install
```

### 6. Start the development server

```bash
cd apps/backend
npm run dev
```

Expected output:

```
[db] Connected to Supabase
[server] Running on http://localhost:4000 (development)
```

### 7. Verify the setup

Test the health endpoint:

```
GET http://localhost:4000/api/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "2026-05-21T..." }
```

Test login with the seed admin account (if you ran `001_initial_schema.sql`):

```
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "admin@sis.local",
  "password": "Admin@1234"
}
```

Expected response:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "...",
    "email": "admin@sis.local",
    "fullName": "System Administrator",
    "role": "admin"
  }
}
```

---

## API Overview

All routes are prefixed with `/api`. Authenticated routes require:

```
Authorization: Bearer <token>
```

### Auth

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Returns JWT + user profile |
| GET | `/api/auth/me` | All roles | Returns current user |

### Gradebook *(Phase 2+)*

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/sections/:id/gradebook` | Faculty | Full grid payload (categories, assessments, scores) |
| PUT | `/api/sections/:id/scores/bulk` | Faculty | Batch cell updates from the grid |
| POST | `/api/sections/:id/finalize` | Faculty | Lock final grades for all students in a section |
| GET | `/api/sections/:id/export` | Faculty | Download gradebook as CSV/XLSX |

### Students *(Phase 3+)*

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/students/:id/grades` | Student | All enrolled sections with computed + finalized grade |
| GET | `/api/students/:id/roadmap` | Student | Units completed vs. program total |

### Health

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Server + DB connectivity check |

> Full route list grows through Phases 2–4. Routes marked *(Phase 2+)* and *(Phase 3+)* are not yet implemented.

---

## Roles & Permissions

| Role | Capabilities |
|---|---|
| **Admin** | Manage users, courses, sections; read audit logs |
| **Faculty** | Read/write gradebook for their own sections only |
| **Student** | Read their own grades and curriculum roadmap |

---

## Deployment

### Backend → Render

1. Push this repo to GitHub.
2. In Render, create a new **Web Service** and connect your repo.
3. Set the root directory to `apps/backend`.
4. Build command: `npm install && npm run build`
5. Start command: `npm run start`
6. Add the following environment variables in Render's dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string (port `6543`) |
| `JWT_SECRET` | Your strong secret |
| `JWT_EXPIRES_IN` | `8h` |
| `CLIENT_ORIGIN` | Your Vercel frontend URL |
| `NODE_ENV` | `production` |

> **Note:** Render's free tier puts services to sleep after 15 minutes of inactivity. The first request after idle will be slow (~30s). Warm up the service before demos.

### Frontend → Vercel *(Phase 3+)*

1. Connect the repo to Vercel; set framework preset to **Vite**.
2. Set root directory to `apps/frontend`.
3. Add environment variable: `VITE_API_BASE_URL` = your Render service URL.

### Database → Supabase

- Run migrations using the **direct connection** (port `5432`).
- Use the **pooler connection** (port `6543`, Transaction mode) as `DATABASE_URL` for the running app.
- Never expose the `service_role` key in the frontend or repo.

---

## Scripts

From `apps/backend`:

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled output (production) |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooler connection string |
| `JWT_SECRET` | Yes | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | No | Token expiry (default: `8h`) |
| `CLIENT_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:5173`) |
| `PORT` | No | Server port (default: `4000`) |
| `NODE_ENV` | No | `development` or `production` |
