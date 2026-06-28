"""
All Claude prompts live here — separated from business logic
so they can be iterated without touching service code.
"""

# ── System prompt (shared across all features) ─────────────────────────────
BASE_SYSTEM = """You are HomeReady, an expert AI assistant helping first-time buyers in the UK navigate the property buying process. You are knowledgeable about UK property law, conveyancing, mortgages, surveys, and the London property market.

Your tone is warm, clear, and reassuring — like a knowledgeable friend who has been through this process many times. You never use unnecessary jargon, and when you must use legal or technical terms, you always explain them immediately.

You always respond in valid JSON that matches the schema requested. Never include markdown code fences or any text outside the JSON object."""


# ── Cost Calculator ────────────────────────────────────────────────────────
def cost_calculator_prompt(
    property_price: float,
    postcode: str,
    is_first_time_buyer: bool,
    deposit: float,
) -> str:
    loan_amount = property_price - deposit
    ltv = (loan_amount / property_price) * 100

    return f"""Calculate the full cost of buying this property for a UK buyer.

Property details:
- Asking price: £{property_price:,.0f}
- Postcode: {postcode}
- First-time buyer: {is_first_time_buyer}
- Deposit: £{deposit:,.0f}
- Mortgage needed: £{loan_amount:,.0f} ({ltv:.0f}% LTV)

Calculate and return a JSON object with this exact structure:
{{
  "property_price": {property_price},
  "total_cost": <number: property_price + all fees + stamp_duty>,
  "stamp_duty": <number: SDLT amount - 0 for FTBs on properties under £425K, reduced rate up to £625K>,
  "breakdown": [
    {{"label": "Stamp Duty Land Tax", "amount": <number>, "note": "<brief explanation>"}},
    {{"label": "Solicitor / Conveyancing fees", "amount": <number: typical £1200-2000 for this price>, "note": ""}},
    {{"label": "Survey (Level 2 HomeBuyer Report)", "amount": <number: typical £400-600>, "note": ""}},
    {{"label": "Mortgage arrangement fee", "amount": <number: typical £999-1499>, "note": "Often added to mortgage"}},
    {{"label": "Mortgage valuation fee", "amount": <number: typical £150-300>, "note": ""}},
    {{"label": "Land Registry fee", "amount": <number: based on price band>, "note": ""}},
    {{"label": "Electronic transfer fee", "amount": 35, "note": ""}},
    {{"label": "Moving costs", "amount": <number: typical £800-1500 for London>, "note": "Estimate"}}
  ],
  "advice": "<2-3 sentences of plain-English advice about this specific purchase, noting anything unusual about the cost profile>"
}}

Use current 2024/2025 SDLT rates and realistic UK market fee ranges. Be precise."""


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
  "green_flags": ["<genuinely positive aspects that appear credible>"],
  "viewing_questions": ["<specific questions to ask the estate agent at viewing, tailored to this property>"]
}}

Be honest and direct. Common euphemisms to watch for: 'cosy/compact' = small, 'investment opportunity' = needs work, 'vibrant area' = noisy, 'moments from' = further than it sounds, 'well-presented' = recently decorated to hide issues."""


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
