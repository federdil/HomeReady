"""
All Claude prompts live here — separated from business logic
so they can be iterated without touching service code.
"""

# ── System prompt (shared across all features) ─────────────────────────────
BASE_SYSTEM = """You are HomeReady, an expert AI assistant helping first-time buyers in the UK navigate the property buying process. You are knowledgeable about UK property law, conveyancing, mortgages, surveys, and the London property market.

Your tone is warm, clear, and reassuring — like a knowledgeable friend who has been through this process many times. You never use unnecessary jargon, and when you must use legal or technical terms, you always explain them immediately.

You always respond in valid JSON that matches the schema requested. Never include markdown code fences or any text outside the JSON object."""


# ── Cost Calculator — advice only ──────────────────────────────────────────
# Every figure below is computed in app/services/calculators.py from published
# rate tables. Claude receives the finished numbers as fact and writes prose
# about them. It is never asked to calculate, sum, or recall a rate — that is
# what produced a £2,500 stamp-duty error and totals that disagreed with their
# own breakdown.
def cost_advice_prompt(
    property_price: float,
    postcode: str,
    is_first_time_buyer: bool,
    deposit: float,
    ltv: float,
    stamp_duty: float,
    fees_total: float,
    cash_needed: float,
    lines: list[tuple[str, float]],
) -> str:
    itemised = "\n".join(f"- {label}: £{amount:,.0f}" for label, amount in lines)

    return f"""These figures have already been calculated and are correct. Do not
recalculate them, restate them as a list, or question them.

- Asking price: £{property_price:,.0f}
- Postcode: {postcode}
- First-time buyer: {is_first_time_buyer}
- Deposit: £{deposit:,.0f} ({ltv:.0f}% LTV)
- Stamp Duty: £{stamp_duty:,.0f}
- All fees and tax: £{fees_total:,.0f}
- Total cash needed on completion: £{cash_needed:,.0f}

Itemised:
{itemised}

Write 2-3 sentences of plain-English advice for this specific purchase. Focus on
what is genuinely notable about this cost profile — an LTV that will affect the
rate offered, a stamp duty threshold sitting close to the asking price, or a
total cash requirement noticeably higher than the buyer likely expected.

Return the advice as plain prose. No JSON, no markdown, no preamble, no bullet
points, and do not begin by repeating the numbers back."""


# ── Listing Decoder ────────────────────────────────────────────────────────
LISTING_DECODER_SYSTEM = BASE_SYSTEM + """

You are an expert at reading UK estate agent listings. You know every euphemism, every selective omission, and every red flag. Your job is to give the buyer the honest picture the estate agent won't."""


def listing_decoder_prompt(listing_text: str, property_type: str = "unknown") -> str:
    return f"""Analyse this UK property listing and decode it honestly for a first-time buyer.

LISTING TEXT:
{listing_text}

Property type hint: {property_type}

Return a JSON object with this exact structure:
{{
  "trust_score": <integer 0-100: how trustworthy and transparent this listing is>,
  "summary": "<2-3 sentence plain-English summary of what this property probably actually is>",
  "euphemisms": [
    {{
      "phrase": "<exact phrase from listing>",
      "likely_meaning": "<what it probably actually means>",
      "severity": "<low|medium|high>"
    }}
  ],
  "missing_info": ["<list of important things absent from the listing, e.g. lease length, service charge, council tax band>"],
  "leasehold": {{
    "detected": <boolean>,
    "lease_years": <integer or null>,
    "risk_level": "<low|medium|high|critical or null>",
    "explanation": "<plain English explanation of the leasehold situation>"
  }},
  "red_flags": ["<genuine concerns a buyer should investigate>"],
  "green_flags": ["<genuinely positive aspects that appear credible>"]
}}

Be honest and direct. Common euphemisms to watch for: 'cosy/compact' = small, 'investment opportunity' = needs work, 'vibrant area' = noisy, 'moments from' = further than it sounds, 'well-presented' = recently decorated to hide issues."""


# ── Viewing Question Generator ─────────────────────────────────────────────

VIEWING_QUESTIONS_SYSTEM = BASE_SYSTEM + """
You are an expert property buyer's advocate with 20 years experience helping first-time buyers in the UK. You generate sharp, specific viewing questions that expose hidden problems estate agents don't volunteer. Every question must be answerable at a viewing — not things to research online."""


def viewing_questions_prompt(
    listing_text: str,
    property_type: str = "unknown",
    red_flags: list[str] | None = None,
    leasehold_detected: bool = False,
) -> str:
    flags_str = "\n".join(f"- {f}" for f in red_flags) if red_flags else "None identified"
    leasehold_note = "This is a leasehold property — include leasehold-specific questions." if leasehold_detected else ""

    return f"""Generate comprehensive viewing questions for a first-time buyer visiting this UK property.

LISTING:
{listing_text}

Property type: {property_type}
Red flags already identified:
{flags_str}
{leasehold_note}

Return a JSON object with this exact structure:
{{
  "priority_questions": [
    "<The 3 most critical questions — if answered badly, walk away>"
  ],
  "categories": [
    {{
      "name": "Structural & Building Condition",
      "questions": ["<4-6 targeted questions about fabric, damp, roof, windows, boiler age>"]
    }},
    {{
      "name": "Legal & Ownership",
      "questions": ["<3-5 questions about boundaries, planning history, building regs, disputes — include leasehold questions if relevant>"]
    }},
    {{
      "name": "Running Costs",
      "questions": ["<3-5 questions about council tax band, service charge, ground rent, utility bills, broadband>"]
    }},
    {{
      "name": "Practical & Lifestyle",
      "questions": ["<3-5 questions about parking, storage, neighbours, noise, mobile signal, bins>"]
    }},
    {{
      "name": "Seller Motivation",
      "questions": ["<2-3 questions that reveal how motivated the seller is and whether there are hidden problems>"]
    }}
  ]
}}

Make every question specific to THIS property based on what the listing says and omits. Do not include generic questions that apply to any property."""


# ── Document Explainer ─────────────────────────────────────────────────────
DOCUMENT_SYSTEM = BASE_SYSTEM + """

You are an expert in UK property law and conveyancing. You can read legal documents and explain them in plain English without giving regulated legal advice. You always flag when something needs the buyer's solicitor's attention."""


def document_explainer_prompt(document_text: str, document_type: str) -> str:
    return f"""Explain the UK property document above ({document_type}) to a first-time buyer in plain English.

Return a JSON object:
{{
  "document_type": "{document_type}",
  "summary": "<3-4 sentence overview of what this document is and what it covers>",
  "clauses": [
    {{
      "clause": "<short title for this clause or section>",
      "plain_english": "<what this actually means in plain English>",
      "importance": "<routine|notable|critical>",
      "action_required": "<what the buyer should do, or null if nothing>"
    }}
  ],
  "action_items": ["<things the buyer needs to do or check as a result of this document>"],
  "questions_for_solicitor": ["<specific questions to raise with their solicitor based on this document>"]
}}

Flag as 'critical': restrictive covenants, rights of way, chancel repair liability, short leases, unusual conditions.
Flag as 'notable': anything non-standard or worth understanding even if not immediately concerning.
Flag as 'routine': standard boilerplate clauses that are normal in every transaction."""


# ── Survey Interpreter ─────────────────────────────────────────────────────
SURVEY_SYSTEM = BASE_SYSTEM + """

You are an expert in UK building surveys and property conditions. You help buyers understand survey findings proportionally — neither dismissing real problems nor causing unnecessary panic about routine maintenance items."""


def survey_interpreter_prompt(survey_text: str, survey_level: str) -> str:
    level_label = "Level 2 HomeBuyer Report" if survey_level == "level_2" else "Level 3 Building Survey"
    return f"""Interpret the {level_label} above for a first-time buyer.

Return a JSON object:
{{
  "overall_assessment": "<proceed|renegotiate|withdraw|investigate>",
  "summary": "<3-4 sentence plain-English overview of the property's condition>",
  "critical_count": <integer>,
  "significant_count": <integer>,
  "advisory_count": <integer>,
  "findings": [
    {{
      "title": "<short title>",
      "category": "<critical|significant|advisory>",
      "description": "<plain English explanation of what this means>",
      "typical_cost_range": "<e.g. £500-2000 or null if unknown>",
      "renegotiation_worthy": <boolean>,
      "action": "<what the buyer should do about this>"
    }}
  ],
  "renegotiation_points": ["<specific findings that justify asking the seller to reduce the price or fix before completion>"],
  "estimated_remediation_cost": "<total estimated cost range for all significant+ findings, or null>"
}}

Categories:
- critical: Safety hazards, structural issues, or problems that could make the property unmortgageable
- significant: Defects needing prompt attention and costing over £1,000 to fix  
- advisory: Routine maintenance items, monitor-only observations"""


# ── Negotiation Coach ──────────────────────────────────────────────────────
NEGOTIATION_SYSTEM = BASE_SYSTEM + """

You are an expert UK property negotiator with deep knowledge of the London and wider UK market. You understand buyer leverage, vendor psychology, and how to structure offers to maximise success for first-time buyers. Be direct, specific, and honest — including when the buyer has weak leverage."""


def negotiation_coach_prompt(
    asking_price: float,
    property_type: str,
    weeks_on_market: int | None,
    chain_status: str,
    buyer_position: str,
    survey_outcome: str | None,
    estimated_repair_cost: float | None,
    seller_situation: str | None,
    comparable_prices: str | None,
) -> str:
    lines = [
        f"- Asking price: £{asking_price:,.0f}",
        f"- Property type: {property_type}",
        f"- Weeks on market: {weeks_on_market if weeks_on_market is not None else 'unknown'}",
        f"- Seller chain status: {chain_status}",
        f"- Buyer position: {buyer_position}",
        f"- Survey outcome: {survey_outcome or 'not yet carried out'}",
    ]
    if estimated_repair_cost:
        lines.append(f"- Estimated repair cost from survey: £{estimated_repair_cost:,.0f}")
    if seller_situation:
        lines.append(f"- Seller situation: {seller_situation}")
    if comparable_prices:
        lines.append(f"- Comparable sold prices: {comparable_prices}")

    return f"""Create a detailed negotiation strategy for this first-time UK buyer.

Property details:
{chr(10).join(lines)}

Return a JSON object with this exact structure:
{{
  "recommended_offer": <integer: the specific offer amount you recommend>,
  "offer_range": {{
    "low": <integer: floor — the lowest defensible offer>,
    "high": <integer: ceiling — the most they should pay>
  }},
  "offer_rationale": "<2-3 sentences explaining why this figure is justified given the specific context>",
  "leverage_points": ["<specific factors that give this buyer negotiating power — be concrete>"],
  "conditions_to_include": ["<non-price conditions to attach to the offer, e.g. fixtures, completion date, survey contingency>"],
  "opening_script": "<exact wording for the offer call or email — ready to use, first person, professional>",
  "likely_counter": "<realistic assessment of how the seller is likely to respond>",
  "walkaway_price": <integer: the absolute maximum they should pay — be disciplined>,
  "negotiation_tips": ["<tactical advice specific to this situation, 3-5 tips>"]
}}"""


# ── Property value summary + feature extraction ────────────────────────────
VALUE_SUMMARY_SYSTEM = BASE_SYSTEM + """

You write short, honest verdicts on individual properties for a buyer who has
already told you what they care about. You are blunt about weaknesses and you
never pad."""


def value_summary_prompt(
    address: str,
    price: float | None,
    bedrooms: int | None,
    property_type: str,
    tenure: str,
    lease_years: int | None,
    price_per_sqft: int | None,
    floor_area_sqft: int | None,
    running_costs_total: float | None,
    running_cost_lines: list[tuple[str, float]],
    dimensions: list[tuple[str, int | None, int, str]],
    fit_score: int | None,
    coverage: int,
    persona_label: str,
    listing_text: str = "",
    key_features: list[str] | None = None,
    wants_outdoor_space: bool = False,
    wants_parking: bool = False,
    wants_period: bool = False,
) -> str:
    """Two jobs in one call: extract the feature facts the structured fields
    cannot express, and write the verdict.

    The extraction is deliberately *facts, not scores* — the score is computed
    in Python from what is returned here, so it stays auditable and re-ranks
    instantly when the buyer changes their priorities.
    """
    facts = [f"- Address: {address or 'not stated'}"]
    if price:
        facts.append(f"- Asking price: £{price:,.0f}")
    if bedrooms is not None:
        facts.append(f"- Bedrooms: {bedrooms}")
    if property_type:
        facts.append(f"- Type: {property_type}")
    if tenure:
        facts.append(
            f"- Tenure: {tenure}"
            + (f", {lease_years} years remaining" if lease_years else "")
        )
    if floor_area_sqft:
        facts.append(f"- Floor area: {floor_area_sqft:,} sq ft")
    if price_per_sqft:
        facts.append(f"- Price per sq ft: £{price_per_sqft:,}")
    if running_costs_total:
        breakdown = ", ".join(f"{label} £{amount:,.0f}" for label, amount in running_cost_lines)
        facts.append(f"- Annual running costs: £{running_costs_total:,.0f} ({breakdown})")

    scored, missing = [], []
    for label, score, weight, detail in dimensions:
        if score is None:
            if weight > 0:
                missing.append(label)
        else:
            scored.append(f"- {label}: {score}/100 (their priority weight {weight}/100) — {detail}")

    wanted = []
    if wants_outdoor_space:
        wanted.append('"outdoor_space": "private" | "communal" | "none" | "not_stated"')
    if wants_parking:
        wanted.append('"parking": "allocated" | "permit" | "none" | "not_stated"')
    if wants_period:
        wanted.append(
            '"period": "georgian" | "victorian" | "edwardian" | "interwar" | '
            '"postwar" | "modern" | "new_build" | "not_stated"'
        )
    features_schema = ",\n    ".join(wanted) if wanted else ""

    extraction_block = f"""
LISTING TEXT (read this for the feature extraction below):
{listing_text[:4000]}

{("KEY FEATURES: " + "; ".join(key_features)) if key_features else ""}
""" if wanted else ""

    features_task = f"""
"features": {{
    {features_schema}
  }},""" if wanted else ""

    guidance = """
For the feature extraction, read the listing text carefully and answer only
from what it actually says:
- Use "not_stated" whenever the listing is silent. Never infer from the property
  type, the area, or what is typical — silence is a real answer and it is the
  answer we want in that case.
- Read negation correctly: "no off-street parking" is "none", not parking.
- Distinguish private from shared: a communal garden or a residents' terrace is
  "communal", not "private". A private balcony or terrace counts as "private".
""" if wanted else ""

    period_guidance = """
For "period", answer about the building the buyer would be living in:
- A named era ("Victorian terrace", "1930s semi", "Georgian townhouse") is that
  era, even if the flat inside was refurbished last year. A refurbishment date
  is not a build date.
- "new_build" is for a building that is itself new or nearly new — a new
  development, off-plan, or first occupation. A period building converted into
  flats is the period, not a new build, however recent the conversion.
- A nearby landmark is not the property. "Opposite the Victorian schoolhouse"
  and "moments from Victoria Park" say nothing about when this was built.
- If the listing only implies an era from the photographs or the area, that is
  "not_stated". Most listings are, and saying so is the useful answer.
""" if wants_period else ""

    return f"""Write a short verdict on this property for a buyer whose profile is "{persona_label}".
{extraction_block}
FACTS (already calculated — use them, never recalculate or add new figures):
{chr(10).join(facts)}

HOW IT SCORES FOR THEM:
{chr(10).join(scored) if scored else "- No dimensions could be scored."}
Overall fit: {fit_score if fit_score is not None else 'not scored'}/100, based on {coverage}% of their stated priorities.
{f"No data available for: {', '.join(missing)}." if missing else ""}

Return a JSON object with this exact structure:
{{{features_task}
  "summary": "<the verdict, 2-4 sentences>"
}}

The verdict should cover:
- What this property is really offering at this price, given its size and running costs.
- The single strongest reason to pursue it and the single strongest reason not to.
- Where the numbers above are incomplete, say what the buyer should check — do not
  fill the gap with a guess.

Weight your emphasis by their priorities: a weakness on a dimension they weighted
highly matters far more than one they weighted near zero. Be direct, and do not
restate the address or repeat the full list of figures back.
{guidance}{period_guidance}
Return only the JSON object. No markdown fences, no text outside it."""
