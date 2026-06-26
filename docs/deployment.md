# Deployment Guide

## Backend → Railway

1. Push the `backend/` folder to a GitHub repo (can be a monorepo)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo and set the root directory to `backend/`
4. Add environment variables in Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `DATABASE_URL` (Railway can provision a Postgres DB for you)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
   - `ENVIRONMENT=production`
   - `CORS_ORIGINS=https://your-app.vercel.app`
5. Railway will detect `railway.toml` and start with `uvicorn`
6. Copy your Railway public URL (e.g. `https://homeready-api.up.railway.app`)

## Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set root directory to `frontend/`
3. Framework preset: **Vite**
4. Add environment variables:
   - `VITE_API_URL` = your Railway backend URL
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy — Vercel auto-detects `vercel.json`

## Database → Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration: `alembic upgrade head` (from backend/ with DATABASE_URL set)
3. Copy `DATABASE_URL` (connection string → use the **asyncpg** format)
4. Copy `SUPABASE_URL` and service key from Project Settings → API

## Local Development

```bash
# Terminal 1: Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn main:app --reload
# → http://localhost:8000/docs

# Terminal 2: Frontend  
cd frontend
npm install
cp .env.example .env.local  # set VITE_API_URL=http://localhost:8000
npm run dev
# → http://localhost:5173
```

## Cost estimate (free tier)

| Service | Free tier | Notes |
|---------|-----------|-------|
| Vercel  | ✅ Free   | 100GB bandwidth/month |
| Railway | ✅ $5 credit/month | ~500 hours compute |
| Supabase| ✅ Free   | 500MB DB, 2GB bandwidth |
| Anthropic| ❌ Pay per token | ~£0.01–0.05 per analysis |
