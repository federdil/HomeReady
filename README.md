# HomeReady

**An honest second opinion on the flats and houses you're considering.**

You tell HomeReady who you are and what matters to you. Then you paste property
links as you find them, and each one lands on a map of London scored against
*your* priorities — with a real door-to-door commute time, recorded crime in the
area, what neighbours actually paid, and what the place will cost you every year
to own.

There is no universal "good area". A flat that suits a couple optimising a
commute is often wrong for a family optimising schools and space, so HomeReady
never gives a property a single objective rating. It gives it a rating *for you*,
and shows you the weights behind it.

> **Scope:** London only. Journey planning uses TfL, which does not cover the
> rest of the UK.

---

## How it works

**1 — Describe what you're looking for.** Pick one of four starting profiles and
adjust it: your budget and deposit, minimum bedrooms, whether you need outdoor
space or parking, and where you need to commute to. Add a workplace for each
person, each with its own acceptable journey time. Then set how much you care
about commute, safety, schools, value and space.

**2 — Paste property links.** Each one is scraped, enriched from public data and
scored in about two seconds. Pins are coloured by fit and carry the score.
Your workplaces show as separate markers. Click any property for the full
breakdown, a plain-English verdict, and its annual running costs — or compare
everything side by side in one table.

**3 — Use the tools when you need them.** A stamp duty and fees calculator, a
listing decoder that translates estate agent language, an offer and negotiation
planner, a conveyancing document explainer, a survey interpreter, and a
post-completion checklist.

---

## How the fit score works

Each property is scored 0–100 on five dimensions, then combined using the
weights from your profile:

| Dimension | What it measures |
|---|---|
| **Commute** | Door-to-door journey time to each of your workplaces, scored on the worst one |
| **Safety** | Recorded street-level crime within roughly a mile |
| **Schools** | Primary and secondary provision within 1.5 km, and how close the nearest is |
| **Value** | Asking price against recent local sales, adjusted for annual running costs |
| **Space** | How the property matches the requirements you stated |

**A dimension with no data leaves the calculation entirely.** It is never
imputed as a middling 50, and never as 0 — the remaining weights renormalise and
you are told what share of your priorities the score actually rests on. A
property showing *"Fit 74 · based on 80% of your priorities"* is missing
something, and the missing dimension says why.

This matters more than it sounds. Filling a gap with a default would let a
property we know nothing about outrank one we know is poor.

---

## Where the numbers come from

Everything is computed from public data. Claude is used for language — reading
listing prose and writing the verdict — and never to calculate, sum, or recall a
figure.

| Source | Provides | Key required |
|---|---|---|
| [postcodes.io](https://postcodes.io) | Coordinates, grid references, statistical areas | No |
| [TfL Unified API](https://api.tfl.gov.uk) | Door-to-door journeys, nearest stations | No |
| [data.police.uk](https://data.police.uk) | Street-level crime by category | No |
| [HM Land Registry Price Paid](https://landregistry.data.gov.uk) | Recent sold prices | No |
| [DfE Get Information About Schools](https://get-information-schools.service.gov.uk) | School locations and phases | No |
| Rightmove listing page | Price, tenure, floor area, service charge, council tax band | No |
| [Anthropic API](https://console.anthropic.com) | Listing interpretation, written verdicts | **Yes** |

Statutory figures — Stamp Duty Land Tax and HM Land Registry fees — come from
rate tables in [`backend/app/services/calculators.py`](backend/app/services/calculators.py),
with the effective date returned in the API response. Where a cost is an
estimate rather than a published rate, the interface says so.

Two known gaps, stated rather than papered over: **Ofsted ratings** are not
available, so the schools score reflects provision and proximity but not
quality; and **flood risk** is not covered at all, because no dependable
property-level source was found.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Map | Leaflet + OpenStreetMap |
| Backend | FastAPI + async SQLAlchemy + asyncpg |
| Database | PostgreSQL |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Auth | Supabase Auth (optional in local development) |
| Migrations | Alembic |
| Deployment | Vercel (frontend) · Railway (backend) |

---

## Project structure

```
homeready/
├── backend/
│   ├── main.py                       # FastAPI entry point
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── search.py             # Persona, geocoding, property assessment
│   │   │   ├── features.py           # Calculator, decoder, legal, offer
│   │   │   └── checklist.py
│   │   ├── core/
│   │   │   ├── signals.py            # Signal envelope — every lookup returns one
│   │   │   ├── claude.py             # Anthropic client, retries, timeouts
│   │   │   └── auth.py, config.py, database.py
│   │   ├── services/
│   │   │   ├── providers/            # One module per external data source
│   │   │   ├── enrichment.py         # Concurrent fan-out over the providers
│   │   │   ├── scoring.py            # Dimension scores and weighted combination
│   │   │   ├── personas.py           # Presets and dimension definitions
│   │   │   ├── calculators.py        # SDLT and fee rate tables
│   │   │   ├── running_costs.py      # Service charge, ground rent, council tax
│   │   │   ├── features_match.py     # Requirements matching, three-state
│   │   │   └── rightmove.py          # Listing parser
│   │   ├── models/                   # SQLAlchemy models + Pydantic schemas
│   │   └── prompts/                  # Claude prompt builders
│   ├── scripts/load_schools.py       # Loads the DfE schools dataset
│   ├── migrations/                   # Alembic
│   └── tests/
└── frontend/
    └── src/
        ├── pages/
        │   ├── PersonaPage.tsx       # Profile and priorities
        │   ├── MapPage.tsx           # Map, ranking, comparison
        │   └── …                     # Calculator, decoder, legal, offer, checklist
        ├── lib/
        │   ├── api.ts                # API client
        │   └── fit.ts                # Client-side scoring mirror for live re-ranking
        ├── components/ui/            # Shared design system
        └── types/
```

---

## Running locally

### Prerequisites

- Python 3.12
- Node.js 18+
- PostgreSQL 14+
- An [Anthropic API key](https://console.anthropic.com)

### 1. Database

```bash
createdb homeready
```

### 2. Backend

```bash
cd backend && python3.12 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

Create `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql+asyncpg://<your-username>@localhost:5432/homeready
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:5173
DEV_NO_AUTH=true
```

`DEV_NO_AUTH` lets you run without a Supabase project: every request is
attributed to one fixed local user, so your profile and properties persist
across restarts. It is ignored unless `ENVIRONMENT` is `development`, and
defaults to off. **Never set it in a deployed environment.** To use real
accounts instead, drop the flag and add `SUPABASE_URL` and
`SUPABASE_SERVICE_KEY`.

Apply migrations and load the schools dataset — a ~65 MB download that populates
around 26,000 open schools, needed before the schools dimension can score:

```bash
alembic upgrade head && python -m scripts.load_schools
```

Start it:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend && npm install
```

Create `frontend/.env.local`:

```
VITE_API_URL=http://localhost:8000
VITE_DEV_NO_AUTH=true
```

If you are using Supabase accounts, drop `VITE_DEV_NO_AUTH` and add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` instead.

```bash
npm run dev
```

Open http://localhost:5173 and fill in your profile.

---

## Tests

```bash
cd backend && python -m pytest tests/ -q
```

The suite covers the rate tables at every band boundary, the rule that missing
data is excluded rather than imputed, requirement matching including negation,
and the listing parser's handling of withdrawn and malformed listings.

```bash
cd frontend && npx tsc --noEmit
```

---

## Deployment

- **Backend** — [Railway](https://railway.app), auto-deploying from `main`. Set
  every `backend/.env` variable in the dashboard, leave `DEV_NO_AUTH` unset, and
  run `scripts/load_schools.py` on a schedule to keep the schools data current.
- **Frontend** — [Vercel](https://vercel.com), via `npx vercel --prod` from
  `frontend/`. Set `VITE_API_URL`, `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, and leave `VITE_DEV_NO_AUTH` unset.

Add your deployed frontend origin to `CORS_ORIGINS` on the backend.

---

## A note on the listing parser

Property details are read from Rightmove listing pages. Automated extraction
sits against Rightmove's terms of use, so this is suitable for personal research
but should be replaced with a licensed data feed before any public deployment.
