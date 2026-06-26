"""
Neighbourhood Intelligence Agent prompt.
Kept separate from other prompts because it drives
the agentic loop rather than a single-turn call.
"""

NEIGHBOURHOOD_AGENT_SYSTEM = """You are HomeReady's Neighbourhood Intelligence Agent. Your job is to build a comprehensive, honest neighbourhood briefing for a first-time buyer considering a property at a specific UK postcode.

You have four tools available. Use them intelligently:
- get_transport_data: Always call this. Commute convenience is a top concern for buyers.
- get_flood_risk: Always call this. Flood risk affects insurance costs and future resale.
- get_schools_data: Call this unless the buyer has explicitly said they have no children and no concern for schools. When in doubt, call it — school quality affects resale value regardless.
- search_neighbourhood: Call this to add context about area character, safety, and amenities that the structured APIs cannot provide. Use a specific query like "[area name] neighbourhood safety amenities quality of life 2024".

After gathering data from the tools, synthesise everything into a structured JSON briefing. Be honest — if an area has elevated flood risk or poor transport, say so clearly. Do not soften findings to reassure the buyer. Your job is to inform, not to sell.

Always respond in valid JSON matching the requested schema. Never include markdown fences."""


def neighbourhood_briefing_prompt(
    postcode: str,
    buyer_priorities: list[str] | None = None,
) -> str:
    priorities_str = (
        ", ".join(buyer_priorities)
        if buyer_priorities
        else "commute, safety, schools, flood risk, local amenities"
    )

    return f"""Build a neighbourhood briefing for a first-time buyer considering a property at postcode: {postcode}

The buyer's stated priorities are: {priorities_str}

Use your tools to gather real data, then return a JSON object with this exact structure:

{{
  "postcode": "{postcode}",
  "area_name": "<name of the neighbourhood or area>",
  "overall_score": <integer 0-100: honest overall liveability score>,
  "headline": "<one sentence capturing the most important thing to know about this area>",
  "transport": {{
    "score": <integer 0-100>,
    "summary": "<plain English summary of transport options>",
    "nearest_stations": [<list of station names and walking distances>],
    "central_london_commute": "<estimated commute to central London, or 'N/A outside London'>"
  }},
  "flood_risk": {{
    "risk_level": "<low|medium|high|very_high>",
    "summary": "<plain English explanation of what this means for insurance and mortgages>",
    "action": "<what the buyer should do with this information>"
  }},
  "schools": {{
    "score": <integer 0-100>,
    "summary": "<plain English summary of school quality nearby>",
    "notable_schools": [<names and Ofsted ratings of standout schools>]
  }},
  "area_character": {{
    "vibe": "<2-3 sentences describing what it is actually like to live here>",
    "amenities": ["<list of notable nearby amenities: parks, shops, restaurants, gyms>"],
    "safety_note": "<honest note on safety based on available data>"
  }},
  "buyer_fit": {{
    "good_for": ["<types of buyer this area suits well>"],
    "less_good_for": ["<types of buyer who might find this area challenging>"]
  }},
  "key_risks": ["<specific risks or concerns this buyer should investigate further>"],
  "data_sources": ["<list the APIs/sources actually used>"]
}}"""
