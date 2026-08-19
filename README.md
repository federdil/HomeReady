# HomeReady

**AI-powered companion for UK first-time home buyers.**

HomeReady guides buyers through every stage of the property purchase journey — from budgeting to getting the keys — using Claude AI to explain complex documents, decode estate agent listings, and give honest neighbourhood intelligence.

---

## Features

| Stage | Feature | Description |
|-------|---------|-------------|
| 1 — Financial Readiness | **Cost Calculator** | True total cost of buying — Stamp Duty, legal fees, surveys, and more |
| 2 — Property Evaluation | **Listing Decoder** | Decodes estate agent language, flags red flags, trust score |
| 2 — Property Evaluation | **Viewing Question Generator** | Tailored viewing questions by property type, tenure, and red flags |
| 2 — Property Evaluation | **Neighbourhood Briefing** | AI agent calls live APIs (TfL, flood risk, Ofsted) to build an honest area briefing |
| 2 — Property Evaluation | **My Shortlist** | Save, annotate, and review properties; sort by trust score, price, or date |
| 3 — Offer & Negotiation | **Offer Strategy** | Recommended offer, leverage points, negotiation script, and walkaway price |
| 4 — Legal & Survey | **Document Explainer** | Explains conveyancing documents clause-by-clause in plain English |
| 4 — Legal & Survey | **Survey Interpreter** | Categorises survey findings (critical / significant / advisory) with renegotiation points |
| 6 — Homeowner Mode | **Post-Completion Checklist** | Interactive checklist of everything to do after getting the keys |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI + async SQLAlchemy + asyncpg |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| Migrations | Alembic |
| Frontend deploy | Vercel |
| Backend deploy | Railway (auto-deploy via GitHub) |

---

## Project Structure

```
homeready/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── app/
│   │   ├── api/routes/          # Feature, auth, and checklist routes
│   │   ├── core/                # Config, database, Claude client, auth
│   │   ├── models/              # SQLAlchemy models + Pydantic schemas
│   │   ├── prompts/             # Claude prompt functions
│   │   └── services/            # Business logic (calls Claude)
│   └── migrations/              # Alembic migrations
└── frontend/
    ├── src/
    │   ├── pages/               # One file per feature page
    │   ├── components/ui/       # Shared design system components
    │   ├── lib/                 # API client, Supabase client, auth context
    │   └── types/               # TypeScript types
    └── public/
```

---

## Running Locally

### Prerequisites
- Python 3.12
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

### Backend

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```
ANTHROPIC_API_KEY=...
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=...
CORS_ORIGINS=http://localhost:5173
```

Run migrations and start:
```bash
alembic upgrade head
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

```bash
npm run dev
```

---

## Running Locally Without Supabase

The hosted Supabase project and Railway service were torn down in August 2026. Until
they are re-provisioned, the app runs entirely on a local Postgres with auth bypassed.

Start Postgres and create the database:

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D "$HOME/Library/Application Support/Postgres/var-18" -l /tmp/pg.log start
```

```bash
createdb -h localhost homeready
```

`backend/.env` needs a local database URL and the dev auth flag:
```
DATABASE_URL=postgresql+asyncpg://<your-mac-username>@localhost:5432/homeready
ENVIRONMENT=development
DEV_NO_AUTH=true
```

`frontend/.env.local` needs the matching flag:
```
VITE_DEV_NO_AUTH=true
```

With `DEV_NO_AUTH` set, every request is attributed to the fixed UUID
`00000000-0000-0000-0000-0000000000de`, so journey progress, shortlist, and checklist
data persist locally across restarts. The bypass is ignored unless `ENVIRONMENT` is
`development`, and both flags default to off — **never set either in Railway or Vercel.**

The original Supabase values are preserved in `backend/.env.backup-supabase` and
`frontend/.env.local.backup-supabase`.

To go back to hosted Supabase: remove both flags, restore the credentials from those
backups, and run `alembic upgrade head` against the new project.

---

## Deployment

- **Backend:** [Railway](https://railway.app) — auto-deploys from the `main` branch. Set all `backend/.env` variables in the Railway dashboard.
- **Frontend:** [Vercel](https://vercel.com) — deploy via `npx vercel --prod` from the `frontend/` directory. Set all `frontend/.env.local` variables in the Vercel dashboard.
