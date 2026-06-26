# HomeReady

**AI-powered companion for UK first-time home buyers.**

HomeReady guides buyers through every stage of the property purchase journey — from budgeting to getting the keys — using Claude AI to explain complex documents, decode estate agent listings, and give honest neighbourhood intelligence.

---

## Features

| Stage | Feature | Description |
|-------|---------|-------------|
| 1 — Financial Readiness | **Cost Calculator** | True total cost of buying — Stamp Duty, legal fees, surveys, and more |
| 2 — Property Evaluation | **Listing Decoder** | Decodes estate agent language, flags red flags, generates viewing questions |
| 2 — Property Evaluation | **Neighbourhood Briefing** | AI agent calls live APIs (TfL, flood risk, Ofsted) to build an honest area briefing |
| 4 — Legal & Survey | **Document Explainer** | Explains conveyancing documents clause-by-clause in plain English |
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

## Deployment

- **Backend:** [Railway](https://railway.app) — set all `backend/.env` variables in the Railway dashboard
- **Frontend:** [Vercel](https://vercel.com) — set all `frontend/.env.local` variables in the Vercel dashboard
