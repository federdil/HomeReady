# HomeReady

**Buying your first home in London is a research project nobody trained you for.**

[**Try it →** homeready-pied.vercel.app](https://homeready-pied.vercel.app)

![Properties you are considering, on a map of London, each scored against your own priorities](docs/images/map.jpg)

You have nine Rightmove tabs open. One flat is £40,000 cheaper than another and
you genuinely cannot tell whether that is a bargain or a warning. The listing
says *"moments from the station"* — which station, and how long does that
actually take to your office on a Tuesday morning? The service charge isn't
mentioned. Neither is the council tax band. You started a spreadsheet three
weekends ago and you've already lost track of which places you liked and why.

And underneath all of it:

- **The asking price tells you nothing.** Whether £550,000 is fair depends on
  what the flats around it actually sold for — which isn't on the listing.
- **The price is not the cost.** Stamp duty, service charge, ground rent,
  council tax. A cheaper flat carrying a £5,000 annual service charge is the
  more expensive purchase, and most people find that out far too late.
- **Listings are written to sell.** "Deceptively spacious", "well presented",
  "would suit an investor" — every phrase is doing work, and none of it for you.
- **"It's a good area" is useless advice.** Good for whom? A 25-minute commute
  is everything to one buyer and irrelevant to another.
- **Nobody in the room works for you.** The estate agent works for the seller.
- **You can't hold it in your head.** Eight properties across six dimensions is
  forty-eight moving facts, and it changes every time a new listing lands.

So you end up making the largest financial decision of your life at speed, in
competition with other buyers, on information chosen by the person selling to you.

---

## What HomeReady does

**It doesn't find you properties.** You'll still do that on Rightmove, the same
way you do now. What it does is judge the ones you've already found, so the
decision about which to spend a Saturday viewing isn't made on nine open tabs
and a feeling.

Tell it who you are and what actually matters to you — that's the yardstick, set
once. Then paste property links as you find them. Each one lands on a map of
London with a real door-to-door commute time to your workplace, recorded crime
in the area, what neighbours actually paid, what the place costs every year to
own — and a score built from *your* priorities, not someone else's.

It won't tell you a property is good. It will tell you what it is, what it will
cost you, and where it falls short of what you asked for — including, plainly,
the things it doesn't know.

**There is no universal "good area".** A flat that suits a couple optimising a
commute is often wrong for a family optimising schools and space. So HomeReady
never gives a property one objective rating. It rates it for you, and shows you
the weights behind the number so you can argue with them.

> **Scope:** London only for now. Door-to-door journey times come from TfL,
> which doesn't cover the rest of the UK.

---

## How it works

**1 — Tell it how to judge a property.** Pick one of four starting profiles and
adjust it. Your budget and deposit. The areas you already want to live in —
most people arrive with a shortlist — and a workplace for each person, each with
its own acceptable journey time. Both are picked from suggestions as you type,
so everything on your profile is a real place, and London only. Then the
property: bedrooms, outdoor space, parking, flat or house, and the kind of
building you want to live in, described the way you'd describe it — a Victorian
terrace with bay windows and fireplaces, a 1930s semi with room for a car, a
new-build tower with a concierge and a service charge to match. Finally, set how
much you care about commute, area, safety, schools, value and space.

![Setting your budget, requirements, workplaces and priorities](docs/images/persona.jpg)

**2 — Paste property links as you find them.** This is where the shortlist comes
from — yours, not ours. Each one is scraped, enriched from public data and
scored in about two seconds. Pins are coloured by fit and carry the score.
Your workplaces show as separate markers. Click any property for the full
breakdown, a plain-English verdict, and its annual running costs — or compare
everything side by side in one table.

![A property's verdict, annual running costs, price per square foot and commute times](docs/images/property.jpg)

Compare everything side by side and each property carries its own figures under
its scores — price per square foot, what it costs to run, council tax band,
journey time, recorded crime, what neighbours paid — with a one-line case for it
and a one-line case against, drawn from the dimensions *you* weighted.

**3 — Use the tools when you need them.** A stamp duty and fees calculator, a
listing decoder that translates estate agent language, an offer and negotiation
planner, a conveyancing document explainer, a survey interpreter, and a
post-completion checklist.

---

## How the fit score works

Each property is scored 0–100 on six dimensions, then combined using the
weights from your profile:

| Dimension | What it measures |
|---|---|
| **Commute** | Door-to-door journey time to each of your workplaces, scored on the worst one |
| **Preferred areas** | How far it is from the nearest area on your shortlist |
| **Safety** | Recorded street-level crime within 800 m, placed against London's own distribution |
| **Schools** | Primary and secondary provision within 1.5 km, and how close the nearest is |
| **Value** | Asking price against recent local sales and your stated ceiling, adjusted for annual running costs |
| **Space** | How the property matches the requirements you stated, including type and period |

**Safety is a comparison, not a verdict.** A crime count inside a fixed radius
tracks how *busy* a place is as much as how risky it is — a high street records
more than the cul-de-sac behind it partly because more people walk down it.
Nothing free supplies a population denominator to divide that out, so rather
than invent a rate the score says something narrower and true: where this area
sits against 191 sampled Greater London postcodes, which carry the same bias.
A mid-range score means "ordinary for London", and the score never reaches 0 or
100 — the data supports neither "nowhere is worse" nor "no crime happens here".

**Your budget caps value, it doesn't average into it.** A house £80,000 over
your ceiling may be the best-priced thing on the street and still be one you
cannot buy, so the overrun caps the value score rather than being blended away,
and the shortfall is shown in pounds wherever the property appears.

**Every number will show you its working.** Each dimension carries a "?" — on
your profile and on every property — that opens the rule behind it: the actual
thresholds, the source, the known weaknesses, and, for a property in front of
you, the measurement that number was derived from. A score you cannot
interrogate is a score you should not trust, and "trust us, it's 38" is the
posture this exists to replace.

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
| [postcodes.io](https://postcodes.io) | Coordinates, grid references, statistical areas, the Greater London boundary | No |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | Place-name suggestions for workplaces and areas | No |
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

Three known gaps, stated rather than papered over: **Ofsted ratings** are not
available, so the schools score reflects provision and proximity but not
quality; **flood risk** is not covered at all, because no dependable
property-level source was found; and a property's **period** is published by
nobody, so it is read out of the listing prose and left unstated — never
guessed — whenever the listing is silent or contradicts itself, which is most
of the time.

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
│   │   │   ├── property_style.py     # Period and built form, from prose and flags
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
        ├── components/
        │   ├── PlaceSearch.tsx       # London place picker for the profile form
        │   ├── ScoreHelp.tsx         # "How is this scored, and why this number?"
        │   └── ui/                   # Shared design system
        └── types/
```

---

## Development

Setup, tests and deployment are in
[`docs/development.md`](docs/development.md).

---

## A note on the listing parser

Property details are read from Rightmove listing pages. Automated extraction
sits against Rightmove's terms of use, so this is suitable for personal research
but should be replaced with a licensed data feed before any public deployment.
