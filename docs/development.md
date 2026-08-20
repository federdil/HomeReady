# Development

Setup, tests and deployment for HomeReady. For what the product does, see the
[README](../README.md).

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
the Greater London boundary check on workplaces and preferred areas, and the
listing parser's handling of withdrawn and malformed listings.

### Recalibrating the safety score

`LONDON_CRIME_PERCENTILES` in
[`backend/app/services/scoring.py`](../backend/app/services/scoring.py) is a
sample of monthly recorded crime within 800 m of 191 randomly drawn Greater
London postcodes. The safety score is a position within that distribution
rather than an absolute judgement, so if London's overall level moves the
constants have to move with it.

To rebuild it, draw random postcodes from `api.postcodes.io/random/postcodes`,
keep the ones whose `region` is `London`, query
`data.police.uk/api/crimes-street/all-crime` with the same 800 m polygon
`app/services/providers/crime.py` builds, and take the percentiles of the
resulting counts. Keep the sample above ~150 postcodes; the distribution has a
long right tail and a smaller sample moves the upper percentiles a lot.

```bash
cd frontend && npx tsc --noEmit
```

---

## Deployment

Backend on Railway, frontend on Vercel, database and auth on Supabase.

### Both platforms need a root directory

The app is a monorepo, so neither platform can find it from the repository root.
This is the single most common cause of a failed first deploy.

- **Vercel** → Settings → General → **Root Directory** = `frontend`
- **Railway** → Settings → Source → **Root Directory** = `backend`

Without it, Vercel fails with `vite: command not found` and Railway can't find
`requirements.txt`.

### Backend (Railway)

Railway reads `backend/railway.toml` and starts uvicorn. Set:

```
ANTHROPIC_API_KEY, DATABASE_URL, SUPABASE_URL,
SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET, SECRET_KEY
ENVIRONMENT=production
CORS_ORIGINS=https://<your-vercel-domain>
```

**Never set `DEV_NO_AUTH` in a deployed environment.** It attributes every
request to one fixed user, so all visitors would share an account. It is ignored
unless `ENVIRONMENT=development`, but do not rely on that alone.

**Migrations run themselves.** The start command in `backend/railway.toml` is
`alembic upgrade head && uvicorn …`, so every deploy migrates before it serves.

This is not a convenience. Migrating by hand made deploys silently
order-dependent: ship code that reads a column the database does not have yet
and every request touching it returns 500, while `/api/v1/health` — which
touches nothing — reports the service healthy. A broken deploy that looks green
is worse than one that fails loudly. The `&&` is what buys that: a migration
that fails stops the container starting, so Railway holds the previous release
rather than putting a server in front of a schema it does not match.

The schools dataset is still a manual, one-off job — it is a ~65 MB download and
does not belong in a start command:

```bash
DATABASE_URL="<production url>" python -m scripts.load_schools
```

Skipping it leaves the schools dimension unscored for every property, which
looks like a bug rather than missing data.

### Frontend (Vercel)

```
VITE_API_URL=https://<your-railway-domain>
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

Leave `VITE_DEV_NO_AUTH` unset. Vite inlines these at **build** time, so
changing one requires a redeploy — editing it in the dashboard alone does
nothing to the running site.

Then add the Vercel domain to `CORS_ORIGINS` on Railway and redeploy the
backend. Until you do, the site loads perfectly and every API call fails.

### Supabase

Enable **Authentication → Providers → Anonymous** so visitors can use the app
without creating an account. Decide separately whether email confirmation should
be required when they choose to save their search.

### Checking what is actually deployed

```
GET /api/v1/version
```

Returns the commit the running process was built from. This matters because
**changing an environment variable restarts the container without rebuilding
it** — a service can serve months-old code while reporting current
configuration, and every dashboard will show the deployment as successful.

Note also that platforms only auto-deploy commits pushed while they are
connected and running. Commits pushed while a service is paused are not built
retroactively when it comes back.
