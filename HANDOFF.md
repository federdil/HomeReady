# HomeReady — Claude Code Handoff

**Session date:** 30 June 2026  
**Picked up by:** Claude Code (continue from Cowork session)  
**Scope:** Strategic assessment, user testing readiness, neighbourhood agent audit, user journey walkthrough

---

## What this project is

HomeReady is a FastAPI + React (Vite + TypeScript + Tailwind) web app — an AI-powered companion for UK first-time home buyers. It uses Claude (claude-sonnet-4-6) for all AI features. The full stack:

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + React Query + React Router — deployed on Vercel
- **Backend:** FastAPI + async SQLAlchemy + asyncpg — deployed on Railway
- **DB/Auth:** Supabase (PostgreSQL + Auth + JWT validation)
- **AI:** Anthropic Claude via `ask_claude()` / `ask_claude_with_tools()` wrappers
- **Migrations:** Alembic

The product has 6 stages mapped to the UK home-buying journey: Financial Readiness → Property Evaluation → Offer & Negotiation → Legal & Survey → Exchange (coming soon) → Homeowner Checklist. Each stage corresponds to a route and page component.

---

## Files created this session

These are net-new files added to the repo during this session. Do not overwrite them.

| File | What it contains |
|------|-----------------|
| `CEO_Assessment.md` | Strategic assessment: 5 challenged assumptions, 5 critical gaps, competitive threat analysis (real competitor is Claude.ai, not Jitty), unit economics back-of-envelope, 10 questions to resolve before launch, strategic recommendation |
| `neighbourhood_agent_analysis.md` | Priority table of 10 neighbourhood signals, per-signal API analysis (endpoint, auth, UK coverage, effort), Tier 1/2/3 build order, fixes for current broken tools |

---

## Critical bugs found — fix these first

These were identified by reading the actual source files. All are in the neighbourhood agent layer.

### Bug 1 — Wrong flood risk data type (`neighbourhood_tools.py:106`)

**File:** `backend/app/services/neighbourhood_tools.py`, lines 99–133  
**Problem:** The EA API call hits `/flood-monitoring/id/floodAreas` with `?dist=0.5`. This endpoint returns **active flood alert zones** (areas currently under warning), not the **long-term flood zone classification** (Zone 1/2/3) that actually determines mortgage eligibility and insurance costs. When no active alerts exist — which is most of the time — it returns empty and the code returns `"flood_risk": "low"`, which is incorrect and potentially misleading to buyers.

**Why it matters:** Mortgage lenders won't lend on properties in Flood Zone 3. A buyer could purchase a Zone 3 property thinking it's low risk based on our output.

**Fix:** Replace with the Long Term Flood Risk API:
```
GET https://environment.data.gov.uk/flood-monitoring/id/floodAreas
```
Should be:
```
GET https://check-long-term-flood-risk.service.gov.uk/api/flood-risk?postcode={postcode}
```
or use the DEFRA WFS endpoint for flood zone polygons. The correct service is documented at `https://environment.data.gov.uk/DefraDataDownload/?Mode=spatial` — specifically the Flood Map for Planning (Rivers and Sea) dataset. Alternative: `https://environment.data.gov.uk/spatialdata/flood-map-for-planning-rivers-and-sea-flood-zone-3/wfs`.

---

### Bug 2 — Unreliable schools endpoint (`neighbourhood_tools.py:141`)

**File:** `backend/app/services/neighbourhood_tools.py`, lines 141–197  
**Problem:** The primary endpoint `https://educationendpointpl.azurewebsites.net/api/schools/search` is a third-party Azure app (not official DfE). The fallback `api.ofsted.gov.uk/v1/search/providers` frequently returns empty arrays — evidenced by the fact that the code has multiple fallbacks and still returns "School data not available" as a common path.

**Why it matters:** School quality is a top concern for resale value regardless of whether the buyer has children. Returning "data unavailable" for schools undermines trust in the whole neighbourhood brief.

**Fix:** Replace with the official DfE Get Information About Schools (GIAS) API:
```
GET https://data.education.gov.uk/api/establishments?postcode={postcode}&radiusInMiles=0.5&statusName=Open
```
This is a public REST API, no auth required. Returns URN, name, school type, phase, Ofsted rating, and coordinates. Tested as reliable. Docs: `https://data.education.gov.uk/docs`.

---

### Bug 3 — DuckDuckGo returns Wikipedia abstracts (`neighbourhood_tools.py:204`)

**File:** `backend/app/services/neighbourhood_tools.py`, lines 204–230  
**Problem:** `search_neighbourhood()` queries the DuckDuckGo Instant Answer API (`api.duckduckgo.com/?format=json`). For area queries like "Clapham neighbourhood safety amenities", this returns the Wikipedia abstract for Clapham — historical facts, etymology, population stats. Completely useless for the "area character, safety sentiment, amenities" intent described in the tool's docstring.

**Why it matters:** The neighbourhood agent system prompt (`neighbourhood_prompt.py:13`) instructs Claude to "call search_neighbourhood to add context about area character, safety, and amenities that the structured APIs cannot provide." If this tool is broken, Claude synthesises the area_character section from nothing, and the output is fabricated.

**Fix options (in order of preference):**
1. **Brave Search API** — free tier 2,000 queries/month, returns real web results. Sign up at `https://api.search.brave.com/`. Header: `X-Subscription-Token`. Returns structured result objects with title/description/url.
2. **Tavily API** — built for AI agents, free tier 1,000 calls/month. `https://tavily.com/`. Returns `answer` field synthesised from web results — drop-in replacement.
3. **SerpAPI (Google)** — paid, more expensive, but highest quality.

Store the API key in Railway env vars as `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY`. Update `neighbourhood_tools.py` to use whichever is chosen.

---

### Bug 4 — TfL transport is London-only with no graceful degradation (`neighbourhood_tools.py:54`)

**File:** `backend/app/services/neighbourhood_tools.py`, lines 54–76  
**Problem:** For non-London postcodes, the function returns `"Outside London ({region}). Check local rail/bus services."` This is a dead end for users. ~50% of UK first-time buyers are buying outside London.

**Why it matters:** The product aspires to serve all UK FTBs, but the neighbourhood agent silently degrades for half the market.

**Fix:** For non-London postcodes, fall back to:
- **National Rail Enquiries API** (`https://rata.rail-research.europa.eu/` or the open Darwin feed) for rail stations
- **Transportapi.com** (freemium) for bus stops
- At minimum, query **postcodes.io** for the admin district and return the nearest named rail stations using the **NaPTAN dataset** (published by DfT as open data, available at `https://naptan.api.dft.gov.uk/`).

Short-term acceptable fix: query postcodes.io for nearby bus stops/rail using the NaPTAN stops endpoint: `https://naptan.api.dft.gov.uk/v1/access-nodes?latLong={lat},{lng}&closeCircle=&requestedDistance=1000`.

---

## Product/strategic context — why behind key decisions

Claude Code doesn't have context on the strategic thinking. Here's the reasoning that informed what's been assessed.

### Why monetisation being "non-blocking" is wrong

The PRD (`HomeReady_PRD.html`) lists the monetisation model as a non-blocking open question. It's not — it's existential. HomeReady's user lifecycle is finite (one purchase per user, typically once in a decade). This means there's no retention flywheel, no upsell, and no recurring revenue. The only viable revenue models are: (a) B2B distribution to mortgage brokers / estate agents who pay per lead or subscription, (b) affiliate commission on mortgage referrals, or (c) premium feature gating. This needs to be decided before any further investment in features, because the distribution model determines which features matter most.

### Why Claude.ai is the real competitor

The market research doc (`homeready-market-research.html`) benchmarks against Rightmove, Zoopla, Jitty, MoneyHelper. It doesn't mention Claude.ai or ChatGPT. A first-time buyer who discovers HomeReady will also try Claude.ai. The differentiation must be: (a) UK-specific regulatory depth (SDLT thresholds, LSA 2007 risk, FCA rules), (b) live data integrations the general LLM can't access (TfL, EA, Ofsted), (c) the journey tracker that persists state across stages. If HomeReady can't articulate this difference to a user in 10 seconds on the auth page, churn will be immediate.

### Why B2B (mortgage brokers) is the strategic wedge

FTBs are hard to acquire at scale. Mortgage brokers see every FTB in the market. A tool that brokers recommend to clients during the initial consultation creates a warm distribution channel with high trust. It also aligns monetisation: brokers pay for referrals or white-label. This reframes HomeReady's target customer from "FTB who finds us on Google" to "mortgage broker who recommends us." The product is already broker-friendly (cost calculator, stamp duty, LTV signals) — it just needs a landing page and outreach to test this hypothesis.

### Why session persistence is the biggest user testing blocker

Currently, decoded listing results live in React component state only (`EvaluatePage.tsx`). Navigating away loses them. This means: (a) a user who decodes a listing and then checks the neighbourhood loses their decoded result when they return, (b) the shortlist saves the `decoded_result` JSON but there's no "resume where you left off" state, (c) in a user testing session, participants will hit this and think the product is broken. Fix: persist decoded results to the API on decode (not just on shortlist save), query them back on page load. This is the most impactful single engineering change for user testing readiness.

---

## What to build next — prioritised

### Tier 1: Fix before any user testing (P0)

1. **Fix the DuckDuckGo web search tool** — swap for Brave Search or Tavily. Estimated effort: 2 hours (get API key, update one function, test).
2. **Fix the flood risk endpoint** — use the LTFR endpoint instead of active alerts. Estimated effort: 3 hours (find correct endpoint, update function, handle zone 1/2/3 response mapping).
3. **Persist decoded listing results to the API** — so navigating away doesn't lose the result. Currently only saved to state; shortlist save is the only persistence path. Add a `decoded_results` table or extend the shortlist logic to auto-save on decode.
4. **Add an onboarding quiz** — 3-question flow on first login: budget range, target area, timeline. Personalises the AI advice across all stages. Without this, the experience starts cold.
5. **Fix email confirmation** — Supabase auth has email confirmation enabled but the app doesn't handle the unconfirmed state gracefully. New users who don't confirm get silently stuck.

### Tier 2: Before launch (P1)

6. **Replace Ofsted API with DfE GIAS API** — see Bug 2 above.
7. **Add NaPTAN fallback for non-London transport** — see Bug 4 above.
8. **Add a "better than ChatGPT" message on the auth page** — the left panel currently lists features. It should lead with the differentiation: live UK data (TfL, Environment Agency, Ofsted), UK legal depth (SDLT, LSA 2007), and the journey tracker. This is the first thing a user evaluating HomeReady vs. "just ask Claude" needs to see.
9. **Make the neighbourhood agent more prominent** — it's currently buried as a sub-tab within EvaluatePage. The live data integrations (TfL, EA, Ofsted) are the clearest competitive moat against general AI. They should be surfaced, not hidden.
10. **Get legal opinions on LSA 2007 and FCA financial promotions** — the document explainer and cost calculator both skirt regulated activity. This is non-blocking for testing with 20 users but is blocking for any kind of public launch.

### Tier 3: Strategic (P2)

11. **B2B outreach to 5 mortgage brokers** — before building more features, validate the distribution hypothesis. Can be done in 1 week with a deck and a demo.
12. **Implement crime data** (`data.police.uk/api/crimes-street/all-crime?lat=&lng=&date=`) — free, no auth, high signal for buyers. Map to neighbourhood score.
13. **Implement EPC data** (MHCLG EPC API) — running cost estimates from energy rating, important for budgeting.
14. **IMD 2025 deprivation scores** (ONS open data) — LSOA-level deprivation deciles.

---

## Key file map for Claude Code

```
homeready/
├── backend/
│   └── app/
│       ├── services/
│       │   ├── features.py          # All Claude calls for non-agentic features
│       │   └── neighbourhood_tools.py   # ← 4 bugs documented above
│       ├── prompts/
│       │   ├── prompts.py           # BASE_SYSTEM + all feature prompts
│       │   └── neighbourhood_prompt.py  # Agentic loop system prompt + briefing schema
│       └── routes/                  # FastAPI route handlers
├── frontend/
│   └── src/
│       ├── App.tsx                  # App shell, routing, sidebar, mobile nav
│       ├── pages/
│       │   ├── ReadinessPage.tsx    # Stage 1: cost calculator
│       │   ├── EvaluatePage.tsx     # Stage 2: listing decoder + sub-tabs
│       │   ├── OfferPage.tsx        # Stage 3: offer strategy + offer meter
│       │   ├── LegalPage.tsx        # Stage 4: document explainer + survey
│       │   ├── HomeownerPage.tsx    # Stage 6: checklist
│       │   └── ShortlistPage.tsx    # Cross-cutting: saved properties
│       └── lib/
│           └── api.ts               # All API calls to FastAPI backend
├── CEO_Assessment.md                # ← Created this session
├── neighbourhood_agent_analysis.md  # ← Created this session
├── HomeReady_PRD.html               # Full PRD v1.1
└── homeready-market-research.html   # Market research and competitor matrix
```

---

## Data connections between stages (important for understanding state flow)

These are the cross-stage data flows that make the product feel coherent. They're implemented via URL params, not a shared state store.

| Source | Destination | What carries over | How |
|--------|-------------|-------------------|-----|
| Listing Decoder | Neighbourhood Agent | Postcode extracted from listing | `?postcode=SW4+7AB` URL param in ContextCTA link |
| Listing Decoder | Offer Strategy | Asking price + property type | `?price=375000&type=flat&context=...` URL param |
| Readiness | Neighbourhood Agent | Postcode from readiness form | Not currently implemented — opportunity |
| Offer Strategy | Legal/Survey | Survey outcome (repair costs) | Not implemented — manual re-entry |

The URL param approach works but means state is lost if the user navigates without using the CTAs. The deeper fix is server-side session state.

---

## REVAMP_SUMMARY.md accuracy note

The file `homeready_revamp/REVAMP_SUMMARY.md` claims "Mobile experience is broken by omission — no mobile navigation replacement." This is **incorrect**. Reading `App.tsx` confirms both `MobileDrawer` (slide-in panel triggered by hamburger) and `BottomNav` (fixed bottom tab bar with stage icons) are fully implemented. The revamp already addressed mobile nav. Do not re-implement this.

---

## How to continue this work in Claude Code

The most impactful first commit is fixing the three broken neighbourhood tools (DuckDuckGo → Brave/Tavily, flood risk → LTFR endpoint, Ofsted → DfE GIAS). These are self-contained changes in `backend/app/services/neighbourhood_tools.py` with no schema changes needed.

After that: adding result persistence for the listing decoder requires a DB migration (new table or new column on existing shortlist table) plus a backend route and frontend mutation.

If picking this up cold, read in this order:
1. `HomeReady_PRD.html` — product scope and requirements  
2. `CEO_Assessment.md` — strategic context and risks  
3. `backend/app/services/neighbourhood_tools.py` — the bugs  
4. `backend/app/prompts/neighbourhood_prompt.py` — what the agent is supposed to do  
5. `frontend/src/pages/EvaluatePage.tsx` — where state persistence is missing  
