# Neighbourhood Agent — Insight Analysis & Data Source Audit
**Date:** June 2026  
**Scope:** What insights matter most to a first-time buyer; what data exists and is implementable

---

## Starting point: what's currently built

The agent has four tools:

| Tool | API Used | Coverage | Status |
|---|---|---|---|
| Transport | TfL StopPoint + postcodes.io | **London only** | Working, but useless for ~60% of UK buyers |
| Flood risk | EA Flood Monitoring (alert areas) | England & Wales | Working, but wrong data type (see below) |
| Schools | Ofsted `/v1/search/providers` | England | **Unreliable** — multiple fallbacks in code suggest frequent failures |
| Web search | DuckDuckGo Instant Answer | Global | Returns Wikipedia abstracts — nearly useless for neighbourhood character |

**The biggest gap is not missing tools — it's that the DuckDuckGo search tool, which is supposed to provide area character, safety, and amenity context, returns Wikipedia summaries rather than real local information. This is the tool Claude calls most often and it's providing near-zero signal.**

---

## Priority ranking: what matters most to a first-time buyer

Ranked by how often these questions appear in r/HousingUK, r/FirstTimeBuyerUK, MSE forums, and first-time buyer research:

| Priority | Insight | Why it matters | Currently in agent? |
|---|---|---|---|
| 1 | **Crime & safety** | #1 question for most buyers. Affects daily life, insurance, resale | ❌ Missing |
| 2 | **Transport** | Commute time and walking distance to stations | ⚠️ London only |
| 3 | **Flood risk (structural)** | Affects mortgage eligibility and insurance costs | ⚠️ Wrong data type |
| 4 | **Price trend** | "Is this area going up or down?" — investment logic | ❌ Missing |
| 5 | **Deprivation index** | Synthesised signal for area quality across 7 dimensions | ❌ Missing |
| 6 | **Local amenities** | Supermarkets, GPs, parks, pharmacies within walking distance | ❌ Missing |
| 7 | **Planning applications** | Nearby large developments = future noise, value change, shadow | ❌ Missing |
| 8 | **Schools** | Resale value signal even for buyers without children | ⚠️ Broken endpoint |
| 9 | **Energy efficiency** | Area EPC average — signals heating costs, upgrade burden | ❌ Missing |
| 10 | **Broadband speed** | Increasingly a deciding factor, especially for WFH buyers | ❌ Missing (paid API) |

---

## Detailed analysis: each insight

---

### 1 — Crime & Safety ❌ Missing · **Highest priority**

**Why it's the most important missing signal:** In virtually every first-time buyer forum, "is it safe?" is the first question asked about any area. No other data point is asked about more frequently, and it's the one data point HomeReady currently has zero coverage on. The DuckDuckGo web search is supposed to cover "safety sentiment" but returns Wikipedia text — useless.

**Available API:** [data.police.uk](https://data.police.uk) — the official UK Police open data platform.

| Property | Detail |
|---|---|
| Auth | None required. Completely free, no API key |
| Endpoint | `GET https://data.police.uk/api/crimes-street/all-crime?lat={lat}&lng={lng}&date=YYYY-MM` |
| Coverage | England, Wales, Northern Ireland |
| Radius | 1 mile default around the lat/lng point |
| Response | Array of crimes with category, street name, approximate location, month |
| Data lag | 2–3 month publication delay (e.g. in June 2026, data available to March 2026) |
| Rate limit | Generous; no documented limit for standard queries |

**What to do with the data:** Don't expose raw crime counts — they vary by area size and policing density and are easily misread. The right output is:
- Total crimes in last 12 months within 1 mile, broken into categories (violent, vehicle, burglary, ASB)
- Trend: is crime count up or down vs. 12 months prior? (call the API twice, compare periods)
- Relative context: "Above/below the national average for this category" (the API also provides force-level and category-level averages)

**Implementation effort:** Low. Two async HTTP calls (current period + year-ago period), aggregate by category, pass to Claude for contextual interpretation.

---

### 2 — Transport (national) ⚠️ London only

**Current gap:** The TfL API is London-only. For any postcode outside the TfL area (which is a growing proportion of FTBs buying in commuter towns — Reading, Bristol, Leeds, Manchester), the agent currently returns: `"Outside London. Check local rail/bus services."` — which is worse than useless.

**Available API: NaPTAN** — the DfT's database of all 350,000 public transport access points in Great Britain.

| Property | Detail |
|---|---|
| Auth | None required. Free download |
| Endpoint | `GET https://beta-naptan.dft.gov.uk/Download/csv` (bulk) or subset by region |
| Format | CSV with lat/lng, stop name, stop type (bus/rail/tram/metro), ATCO code |
| Coverage | All of Great Britain |
| Freshness | Updated by local authorities, generally reliable |

**Recommended approach:** Download the NaPTAN CSV (bus stops and rail stations subset), host it or query it at startup, then implement a fast in-memory radius search by lat/lng. This avoids the bulk data problem — you don't need the full 350K rows, just bus stops and rail stations with their coordinates.

Alternatively, **TransportAPI** has a managed REST endpoint for stops near a location (`GET https://transportapi.com/v3/uk/places.json?lat=&lon=&type=train_station,bus_stop`) but it requires a free-tier API key (500 requests/day free, then paid). Their free tier is likely sufficient for early users.

For rail outside London, **National Rail's Darwin** data feed provides real-time train times and journey planning but is complex to integrate. For MVP purposes, walking distance to the nearest train station (from NaPTAN) is sufficient — buyers care more about "how far to the station" than real-time departures.

---

### 3 — Flood Risk (structural, not alert) ⚠️ Wrong data type

**Current problem:** The agent calls the EA Flood Monitoring API's `/floodAreas` endpoint, which returns active flood alert areas. This tells you if there's a current or recent flood warning in the vicinity — useful for actual flooding events, not for property purchase decisions.

What buyers (and mortgage lenders) care about is the **long-term flood risk classification**: Flood Zone 1 (less than 0.1% annual probability), Zone 2 (0.1–1%), Zone 3a (1% or more), Zone 3b (functional floodplain). Zone 3 properties face mortgage refusals and insurance loading. Zone 1 is standard risk.

**Available API:**

| Property | Detail |
|---|---|
| Source | Environment Agency Flood Map for Planning (WMS service) |
| Auth | None required. Free, open |
| Endpoint (WMS) | `https://environment.data.gov.uk/spatialdata/flood-map-for-planning-rivers-and-sea-flood-zone-3/wms` |
| Alt endpoint | `https://environment.data.gov.uk/spatialdata/flood-map-for-planning-rivers-and-sea-flood-zone-2/wms` |
| Method | WMS GetFeatureInfo with lat/lng → returns flood zone classification |
| Coverage | England only (separate datasets for Wales via NRW) |

The simpler consumer-facing alternative is the official GOV.UK long-term flood risk API, which accepts a postcode and returns a risk level. The current agent already links to `check-long-term-flood-risk.service.gov.uk` — there is a JSON-compatible data endpoint behind this service.

**Practical fix:** Replace the current `/floodAreas` call with a call to the [Long Term Flood Risk API](https://check-long-term-flood-risk.service.gov.uk) which returns zone classification for any postcode in plain JSON. This is the data that actually affects a buyer's ability to get a mortgage and what insurance companies use.

---

### 4 — Price Trend ❌ Missing · **High value, low effort**

**Why it matters:** "Is this area going up or down?" is asked at every stage of the buying decision. A buyer considering two similar properties in different postcodes will use price trend to break the tie. This is also the signal that most clearly differentiates HomeReady from a general LLM — Claude cannot answer this question without live data.

**Available APIs — two options:**

**Option A: UK House Price Index (HMLR)**
| Property | Detail |
|---|---|
| Auth | None. Free, open SPARQL endpoint |
| Endpoint | `http://landregistry.data.gov.uk/landregistry/query` |
| Query | SPARQL filtering by `hpi:refRegion` (local authority or region) |
| Returns | Average price, monthly/annual % change, sales volume back to 1995 |
| Coverage | England, Wales, Scotland (regional level, not postcode) |
| Lag | ~6 week publication delay |

**Option B: Land Registry Price Paid SPARQL**
| Property | Detail |
|---|---|
| Auth | None. Free |
| Endpoint | `https://landregistry.data.gov.uk/landregistry/query` |
| Returns | Individual sale records filterable by postcode prefix, date range, property type |
| Use case | "What did similar properties in this postcode sell for in the last 18 months?" |
| Lag | 3–6 months (registration can take time after transaction) |

**Recommended output for the buyer:** "Properties in [area] have increased in value by X% over the last 12 months, vs. Y% nationally. Average sale price for a [type] is £Z." This contextualises whether the asking price is reasonable and whether the area is growing or declining.

---

### 5 — Index of Multiple Deprivation (IMD 2025) ❌ Missing · **High value, zero ongoing cost**

**Why it matters:** The IMD is a single composite score that ranks every small area in England (33,000 areas) across 7 dimensions: income, employment, education, health, crime, barriers to housing/services, and living environment. It's the most data-rich single signal for area quality. A buyer considering two postcodes can immediately see which is more deprived and on which dimension.

**MHCLG released IMD 2025 data in late 2025** — this is the freshest release available.

**Available data:**
| Property | Detail |
|---|---|
| Auth | None. Open Government Licence |
| Source | [GOV.UK English indices of deprivation 2025](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025) |
| Format | CSV download (LSOA-level). ~33,000 rows |
| Postcode mapping | ONS Postcode to LSOA lookup (also a free CSV download) |
| Coverage | England only (Wales/Scotland have separate datasets) |

**Implementation approach:** This is a static lookup, not an API call. Download two CSVs (postcode→LSOA mapping, LSOA→IMD scores), join them, embed as a lookup table. Zero runtime cost, sub-millisecond response. Map the numeric decile (1 = most deprived, 10 = least) to a plain-English description across each domain.

**Output example:**
> "This area is in the 3rd most deprived decile nationally for income, but 7th decile for education and 8th for living environment — suggesting an area in transition with improving infrastructure but economic pressure still present."

This is the kind of nuanced, honest assessment that no estate agent will give and that Claude cannot produce from training data alone.

---

### 6 — Local Amenities ❌ Missing

**Why it matters:** "Is there a Tesco within walking distance?" and "How far is the nearest GP?" are practical questions that affect daily liveability. Missing amenities are often discovered post-purchase and are a source of buyer regret.

**Available API:** OpenStreetMap via Overpass API

| Property | Detail |
|---|---|
| Auth | None required. Free |
| Endpoint | `https://overpass-api.de/api/interpreter` |
| Method | POST with Overpass QL query |
| Coverage | Global, UK coverage is comprehensive |
| Data quality | Excellent for major amenities (supermarkets, parks, hospitals); variable for independents |

**Overpass QL query for amenities within 800m of a point:**
```
[out:json];
(
  node["amenity"~"supermarket|hospital|pharmacy|doctors|school|park|gym"](around:800,{lat},{lng});
  way["amenity"~"supermarket|hospital|pharmacy|doctors|school|park|gym"](around:800,{lat},{lng});
);
out center;
```

**Amenity categories to query:**
- `supermarket` — major grocery
- `doctors` + `pharmacy` — healthcare access
- `park` — green space (tagged as `leisure=park`)
- `gym` / `sports_centre`
- `restaurant` + `cafe` — social infrastructure
- `bank` / `atm`
- `post_office`

**Output:** Walk-time categorisation (< 5 min / 5–10 min / > 10 min), similar to a simplified Walk Score. Don't overwhelm the buyer with a list of 40 amenities — score the categories (Excellent / Good / Limited) and name 2–3 highlights.

---

### 7 — Planning Applications ❌ Missing · **Most differentiated signal**

**Why it matters:** A large development approved 200 metres away (residential tower, distribution hub, road widening) can dramatically affect liveability and property value. This is information buyers routinely miss and discover post-completion. No other consumer product surfaces this at the property evaluation stage.

**Available API:** [planning.data.gov.uk](https://www.planning.data.gov.uk)

| Property | Detail |
|---|---|
| Auth | None required. Free |
| Endpoint | `GET https://www.planning.data.gov.uk/api/v1/entity.json?dataset=planning-application&geometry_relation=intersects&geometry={WKT_polygon}` |
| Alt | Pass `point=POINT(lng lat)` for a specific location |
| Filters | `start_date_year=2023` to limit to recent applications |
| Coverage | England. Coverage varies by local authority — some councils submit more completely than others |
| Returns | Application reference, description, decision, decision date, geometry |

**What to surface:** Focus on applications within 500m with a decision date in the last 3 years or still pending. Flag major categories: residential development (50+ units), commercial/industrial, infrastructure (roads, utilities), demolition of existing structures.

**Output example:**
> "⚠️ One pending planning application within 300m: a 120-unit residential development at Former Industrial Site, Larch Street. Decision expected Q4 2026. This could bring construction noise for 2–3 years but may improve local amenities long-term."

---

### 8 — Schools ⚠️ Broken endpoint

**Current problem:** The agent calls `api.ofsted.gov.uk/v1/search/providers` — this endpoint appears unreliable (the code has a fallback that triggers a "data not available" response). The Ofsted public API is not well-documented and has historically been unstable.

**More reliable alternative: DfE Schools API**

| Property | Detail |
|---|---|
| Auth | None required |
| Endpoint | `https://data.education.gov.uk/api/establishments?postcode={postcode}&radiusInMiles=0.5` |
| Returns | School name, type, Ofsted rating, number on roll, phase (primary/secondary) |
| Coverage | England |
| Reliability | Better than the Ofsted endpoint — backed by DfE's Edubase dataset |

The Ofsted rating data in this endpoint is also more complete than the Ofsted search API.

---

### 9 — EPC (Energy Performance) ❌ Missing

**Why it matters for buyers:** EPC ratings directly affect heating bills and future upgrade costs. The UK's 2035 EPC Band C mandate for rented properties and ongoing government pressure on owner-occupiers means a Band F or G property carries future upgrade liability. Area-level EPC averages also indicate the age and construction quality of local housing stock.

**Available API:** [MHCLG EPC Open Data](https://get-energy-performance-data.communities.gov.uk/)

| Property | Detail |
|---|---|
| Auth | **Required** — free account registration, API key by email |
| Endpoint | `GET https://epc.opendatacommunities.org/api/v1/domestic/search?postcode={postcode}` |
| Returns | EPC rating, energy efficiency score, environmental impact, lodgement date, property type |
| Coverage | England & Wales (~29M certificates) |
| Limit | 5,000 records per query, 10,000 API calls/day on free tier |
| ⚠️ Note | The `epc.opendatacommunities.org` endpoint was being retired as of May 2026 — the replacement is `get-energy-performance-data.communities.gov.uk` |

**Practical output:** For a given postcode, retrieve the most recent EPC for a handful of nearby properties and compute the local average rating. Output: "Properties in this area typically carry EPC rating D. Heating costs for a 2-bed flat are approximately £X/year at current rates. Factor in £Y–Z for insulation upgrades to reach Band C."

**Implementation note:** Requires one-time registration. Given the auth barrier, this is a Tier 2 addition — valuable but not blocking for v1 user testing.

---

### 10 — Broadband Speed ❌ Missing (limited free access)

**Why it matters:** With remote/hybrid work now standard, broadband speed is a genuine buying criterion, especially outside city centres.

**Available data:**
| Option | Detail |
|---|---|
| Ofcom Checker API | Requires subscription key (`api-proxy.ofcom.org.uk`) — not freely accessible |
| Ofcom annual CSV | Ofcom publishes "Connected Nations" data annually as open CSV, by postcode district. Free but one year lag. |
| ISP postcode checkers | BT Openreach publish coverage data but not via open API |

**Practical recommendation:** Use Ofcom's annual Connected Nations CSV as a static lookup (postcode district → average download speed, % premises with full-fibre). Update once a year when Ofcom publishes. This gives a reasonable signal with zero ongoing API cost. Not per-address precise, but sufficient for a neighbourhood briefing.

---

## Summary: what to build and in what order

### Tier 1 — Build before user testing (high impact, low effort, free)

| # | Signal | API | Effort |
|---|---|---|---|
| 1 | **Crime & safety** | data.police.uk — no auth, lat/lng, 12-month window | Low — 1 new tool function |
| 2 | **Fix flood risk** | Replace `/floodAreas` with Long Term Flood Risk endpoint | Low — swap existing call |
| 3 | **Fix schools** | Replace Ofsted endpoint with DfE Edubase API | Low — swap existing endpoint |
| 4 | **Fix web search** | Replace DuckDuckGo Instant Answer with a proper web search or Brave Search API | Medium — affects area character signal |
| 5 | **IMD deprivation** | MHCLG static CSV lookup (postcode → LSOA → IMD score) | Low-Medium — offline join, static data |

### Tier 2 — Build for launch (meaningful differentiation)

| # | Signal | API | Effort |
|---|---|---|---|
| 6 | **Price trend** | HMLR UK HPI SPARQL endpoint — no auth | Medium — SPARQL query, mapping region codes |
| 7 | **Local amenities** | OpenStreetMap Overpass API — no auth, lat/lng radius | Medium — Overpass QL query, category scoring |
| 8 | **National transport** | NaPTAN CSV (bus stops + rail) + radius query | Medium — download + index ~50K rail/station rows |
| 9 | **Planning applications** | planning.data.gov.uk — no auth | Medium — geometry search, description parsing |

### Tier 3 — Post-launch (good, but requires more effort or registration)

| # | Signal | API | Effort |
|---|---|---|---|
| 10 | **EPC area average** | MHCLG EPC API — free, requires registration | Low-Medium once registered |
| 11 | **Broadband speed** | Ofcom annual CSV static lookup | Low — one-time data load |

---

## The web search problem deserves special attention

The current `search_neighbourhood` tool using DuckDuckGo Instant Answer is the agent's only source of:
- Area character ("what's it like to live here?")
- Safety sentiment
- Amenity context
- Regeneration / development news

And it's returning Wikipedia summaries. This is the most impactful fix in the entire agent because Claude calls this tool on virtually every query.

**Replacement options:**
- **Brave Search API** — free tier (2,000 queries/month), returns real web results. Best free option.
- **SerpAPI** — paid ($50/month), reliable Google results
- **Tavily Search API** — built for AI agents, returns structured summaries from web results, free tier available

The neighbourhood agent's "area character" section is only as good as its search results. Fixing this single tool will have more impact on output quality than adding any other data source.

---

*Research based on: data.police.uk, epc.opendatacommunities.org, planning.data.gov.uk, landregistry.data.gov.uk, beta-naptan.dft.gov.uk, environment.data.gov.uk, gov.uk/government/statistics/english-indices-of-deprivation-2025, openstreetmap.org, transportapi.com, checker.ofcom.org.uk. June 2026.*
