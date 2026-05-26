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

The production stack is three pieces wired together:

```
   Vercel (frontend, static)  ──HTTPS──▶  Render (backend, Node)  ──TLS──▶  Supabase (Postgres)
```

Set up Supabase first, then Render (you'll need its URL for Vercel's env vars), then Vercel (you'll need its URL for Render's CORS).

---

### 1. Database → Supabase

1. Create a new project. Pick the region closest to your users (e.g. **Southeast Asia (Singapore)**).
2. **Run the schema.** Project → **SQL Editor** → paste [`migrations/schema.sql`](migrations/schema.sql) → **Run**. Then run [`migrations/seed.sql`](migrations/seed.sql) for the admin user + BSCS curriculum.
3. **Grab connection strings.** Project Settings → **Database** → **Connection string**:
   - **Pooler** (port `6543`, Transaction mode) — this is your `DATABASE_URL` for the running app.
   - **Direct** (port `5432`) — only used if you ever run a one-off migration locally against prod.
4. Never expose the `service_role` key. The backend uses Postgres credentials only.

---

### 2. Backend → Render

The repo ships with [`render.yaml`](render.yaml), a Render Blueprint that describes the service. You can either use the Blueprint flow (one click) or set the same fields by hand.

#### Option A — Blueprint (recommended)

1. Push the repo to GitHub.
2. In Render, **New +** → **Blueprint** → pick this repo. Render reads `render.yaml` and offers to create the `cursus-backend` service.
3. When prompted, fill in the secret env vars (they're marked `sync: false` so they're never committed):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler string (port `6543`, Transaction mode) |
   | `JWT_SECRET` | A long random secret (`openssl rand -hex 64`) |
   | `CLIENT_ORIGIN` | Your Vercel URL (set after step 3 — temporarily put `http://localhost:5173` and update later) |
   | `CLIENT_ORIGIN_PATTERN` | *(optional)* Regex to allow Vercel preview URLs |

4. Click **Apply**. The first build takes ~3 minutes (`npm install --include=dev && npm run build && npm prune --omit=dev`). After it boots, hit `https://<your-service>.onrender.com/api/health` — you should see `{"status":"ok"}`.

#### Option B — Manual setup

If you'd rather not use the Blueprint, create a **Web Service** with:

| Field | Value |
|---|---|
| Root directory | `apps/backend` |
| Build command | `npm install --include=dev && npm run build && npm prune --omit=dev` |
| Start command | `npm run start` |
| Health check path | `/api/health` |
| Environment | All of the variables in the table above, plus `NODE_ENV=production`, `JWT_EXPIRES_IN=8h`, `PORT=4000` |

> **Cold-start warning:** Render's free tier sleeps the service after 15 minutes idle. The first request after sleep takes ~30s. For demos, hit `/api/health` a minute before. Upgrade to **Starter** ($7/mo) for always-on.

---

### 3. Frontend → Vercel

The repo ships with [`apps/frontend/vercel.json`](apps/frontend/vercel.json), which pins the framework + adds the SPA rewrite so React Router routes survive a hard refresh.

1. **Import** the repo into Vercel.
2. Set **Root Directory** to `apps/frontend`. (Framework auto-detects as **Vite** thanks to `vercel.json`.)
3. Add the environment variable:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api` |

4. **Deploy.** Vercel runs `npm install` → `npm run build` → serves `dist/`.

5. **Wire up CORS.** Copy the Vercel URL Vercel gave you (e.g. `https://cursus.vercel.app`), then go back to Render → Environment → set `CLIENT_ORIGIN` to that URL. Render auto-redeploys.

   To allow per-PR preview URLs too, set `CLIENT_ORIGIN_PATTERN` to something like:
   ```
   ^https://cursus-[a-z0-9-]+-yourteam\.vercel\.app$
   ```

---

### 4. Smoke test the live stack

```bash
# Health check the backend (should return 200 within a few seconds, ~30s if cold)
curl https://<your-render-service>.onrender.com/api/health

# Open the frontend, log in with admin@sis.local / Admin@1234 (change immediately).
```

If the frontend loads but login fails with a CORS error in DevTools, double-check that `CLIENT_ORIGIN` on Render matches your Vercel URL **exactly** (no trailing slash, correct protocol).

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

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooler connection string (port `6543`, Transaction mode) |
| `JWT_SECRET` | Yes | Secret used to sign JWTs — generate with `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | No | Token expiry (default: `8h`) |
| `CLIENT_ORIGIN` | No | Comma-separated allowed origins (default: `http://localhost:5173`) |
| `CLIENT_ORIGIN_PATTERN` | No | Regex matched against the `Origin` header — useful for Vercel preview URLs |
| `PORT` | No | Server port (default: `4000`) |
| `NODE_ENV` | No | `development` or `production` |

### Frontend (`apps/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Base URL for the backend API (e.g. `http://localhost:4000/api`) |
