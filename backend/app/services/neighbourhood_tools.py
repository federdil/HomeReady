"""
Neighbourhood Intelligence Agent — tools layer.

Each function here is a tool Claude can call.
They hit real public APIs where available, with graceful
fallback to synthetic data for development.

APIs used:
  - TfL Unified API (free, no key needed for basic journey times)
  - Environment Agency Flood Risk API (free, open)
  - Ofsted API / schools data (free, open)
  - web_search via httpx (DuckDuckGo instant answers, no key needed)
"""
import httpx
import asyncio
from typing import Optional
import structlog

log = structlog.get_logger()

# ── HTTP client shared across all tools ───────────────────────────────────
_client = httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "HomeReady/1.0"})


# ── Tool 1: Transport ─────────────────────────────────────────────────────
async def get_transport_data(postcode: str) -> str:
    """
    Returns commute times and transport options near a UK postcode.
    Uses TfL API for London postcodes, falls back to general data.
    """
    postcode_clean = postcode.replace(" ", "").upper()
    log.info("tool_transport", postcode=postcode_clean)

    try:
        # Resolve postcode to lat/lng via postcodes.io (free, no key)
        geo_resp = await _client.get(
            f"https://api.postcodes.io/postcodes/{postcode_clean}"
        )
        if geo_resp.status_code != 200:
            return f"Could not resolve postcode {postcode}."

        geo = geo_resp.json()["result"]
        lat, lng = geo["latitude"], geo["longitude"]
        region = geo.get("region", "")
        district = geo.get("admin_district", "")

        result = {
            "postcode": postcode,
            "region": region,
            "district": district,
            "coordinates": {"lat": lat, "lng": lng},
        }

        # TfL StopPoint near location (London only)
        if "London" in region or postcode_clean[:2] in (
            "E1","E2","E3","E4","E5","E6","E7","E8","E9",
            "EC","N1","N2","N3","N4","N5","N6","N7","N8",
            "NW","SE","SW","W1","W2","W3","WC","BR","CR",
            "DA","EN","HA","IG","KT","RM","SM","TW","UB","WD"
        ):
            stops_resp = await _client.get(
                "https://api.tfl.gov.uk/StopPoint",
                params={"lat": lat, "lon": lng, "stopTypes": "NaptanMetroStation,NaptanRailStation", "radius": 800},
            )
            if stops_resp.status_code == 200:
                stops = stops_resp.json().get("stopPoints", [])
                nearest = [
                    {"name": s["commonName"], "distance_m": int(s.get("distance", 0))}
                    for s in stops[:5]
                ]
                result["nearest_stations"] = nearest
                result["transport_note"] = f"{len(stops)} stations within 800m."
            else:
                result["transport_note"] = "TfL data unavailable for this postcode."
        else:
            result["transport_note"] = f"Outside London ({region}). Check local rail/bus services."

        return str(result)

    except Exception as e:
        log.error("transport_tool_error", error=str(e))
        return f"Transport data unavailable: {str(e)}"


# ── Tool 2: Flood Risk ────────────────────────────────────────────────────
async def get_flood_risk(postcode: str) -> str:
    """
    Returns flood risk classification from the Environment Agency.
    EA Flood Map API — free, open, no authentication required.
    """
    postcode_clean = postcode.replace(" ", "").upper()
    log.info("tool_flood_risk", postcode=postcode_clean)

    try:
        # Get lat/lng first
        geo_resp = await _client.get(
            f"https://api.postcodes.io/postcodes/{postcode_clean}"
        )
        if geo_resp.status_code != 200:
            return f"Could not resolve postcode {postcode}."

        geo = geo_resp.json()["result"]
        lat, lng = geo["latitude"], geo["longitude"]

        # EA Flood Zones API
        ea_resp = await _client.get(
            "https://environment.data.gov.uk/flood-monitoring/id/floodAreas",
            params={"lat": lat, "long": lng, "dist": 0.5},
        )

        if ea_resp.status_code == 200:
            items = ea_resp.json().get("items", [])
            if not items:
                return str({
                    "postcode": postcode,
                    "flood_risk": "low",
                    "flood_zones": [],
                    "summary": "No flood alert areas recorded within 500m of this postcode."
                })

            zones = [
                {"label": item.get("label", "Unknown"), "description": item.get("description", "")}
                for item in items[:3]
            ]
            return str({
                "postcode": postcode,
                "flood_risk": "elevated",
                "flood_zones": zones,
                "summary": f"{len(items)} flood alert area(s) within 500m. Check EA flood map for full detail.",
                "ea_map_url": f"https://check-long-term-flood-risk.service.gov.uk/map?easting={lng}&northing={lat}"
            })
        else:
            return f"Environment Agency API returned status {ea_resp.status_code}."

    except Exception as e:
        log.error("flood_risk_tool_error", error=str(e))
        return f"Flood risk data unavailable: {str(e)}"


# ── Tool 3: Schools ───────────────────────────────────────────────────────
async def get_schools_data(postcode: str) -> str:
    """
    Returns nearby Ofsted-rated schools from the DfE Get Information About Schools API.
    Free, open, no authentication required.
    """
    postcode_clean = postcode.replace(" ", "").upper()
    log.info("tool_schools", postcode=postcode_clean)

    try:
        # DfE GIAS API — search schools by postcode
        gias_resp = await _client.get(
            "https://educationendpointpl.azurewebsites.net/api/schools/search",
            params={"postcode": postcode_clean, "radiusInMiles": 0.5},
        )

        # Fallback: Ofsted registered inspections endpoint
        ofsted_resp = await _client.get(
            f"https://api.ofsted.gov.uk/v1/search/providers?postcode={postcode_clean}&radius=0.5&ofstedRating=1,2",
            timeout=8.0,
        )

        schools = []

        if ofsted_resp.status_code == 200:
            providers = ofsted_resp.json().get("providers", [])[:6]
            for p in providers:
                schools.append({
                    "name": p.get("name", "Unknown"),
                    "type": p.get("typeOfProvision", ""),
                    "ofsted_rating": p.get("overallEffectiveness", "Not rated"),
                    "ofsted_label": _ofsted_label(p.get("overallEffectiveness")),
                })

        if not schools:
            return str({
                "postcode": postcode,
                "schools_nearby": [],
                "summary": "School data not available for this postcode via API. Check Ofsted.gov.uk directly.",
                "ofsted_search_url": f"https://reports.ofsted.gov.uk/search?q=&location={postcode_clean}&miles=1"
            })

        outstanding = sum(1 for s in schools if "Outstanding" in s.get("ofsted_label", ""))
        return str({
            "postcode": postcode,
            "schools_nearby": schools,
            "outstanding_count": outstanding,
            "summary": f"{len(schools)} schools within 0.5 miles. {outstanding} rated Outstanding.",
        })

    except Exception as e:
        log.error("schools_tool_error", error=str(e))
        return str({
            "postcode": postcode,
            "schools_nearby": [],
            "summary": f"School data lookup failed. Check Ofsted.gov.uk for schools near {postcode}.",
            "ofsted_search_url": f"https://reports.ofsted.gov.uk/search?q=&location={postcode_clean}&miles=1"
        })


def _ofsted_label(rating) -> str:
    return {1: "Outstanding", 2: "Good", 3: "Requires improvement", 4: "Inadequate"}.get(rating, "Not rated")


# ── Tool 4: Web Search (neighbourhood sentiment) ──────────────────────────
async def search_neighbourhood(query: str) -> str:
    """
    Searches for neighbourhood information using DuckDuckGo Instant Answer API.
    No API key required.
    """
    log.info("tool_search", query=query)
    try:
        resp = await _client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
        )
        if resp.status_code != 200:
            return f"Search unavailable (status {resp.status_code})."

        data = resp.json()
        abstract = data.get("AbstractText", "")
        related = [r.get("Text", "") for r in data.get("RelatedTopics", [])[:3] if r.get("Text")]

        if not abstract and not related:
            return f"No instant answer found for: {query}"

        return str({"query": query, "summary": abstract, "related": related})

    except Exception as e:
        log.error("search_tool_error", error=str(e))
        return f"Search failed: {str(e)}"


# ── Tool registry — passed to ask_claude_with_tools ───────────────────────
NEIGHBOURHOOD_TOOL_HANDLERS = {
    "get_transport_data":    get_transport_data,
    "get_flood_risk":        get_flood_risk,
    "get_schools_data":      get_schools_data,
    "search_neighbourhood":  search_neighbourhood,
}

NEIGHBOURHOOD_TOOL_DEFINITIONS = [
    {
        "name": "get_transport_data",
        "description": "Fetches nearest tube/rail stations and transport options for a UK postcode using TfL and postcodes.io APIs. Use this to assess commute convenience.",
        "input_schema": {
            "type": "object",
            "properties": {
                "postcode": {"type": "string", "description": "UK postcode, e.g. 'E1 6RF'"}
            },
            "required": ["postcode"],
        },
    },
    {
        "name": "get_flood_risk",
        "description": "Checks Environment Agency flood risk data for a UK postcode. Use this to identify flood zone risk that could affect insurance, mortgages, or future resale.",
        "input_schema": {
            "type": "object",
            "properties": {
                "postcode": {"type": "string", "description": "UK postcode, e.g. 'E1 6RF'"}
            },
            "required": ["postcode"],
        },
    },
    {
        "name": "get_schools_data",
        "description": "Looks up nearby Ofsted-rated schools within 0.5 miles of a postcode. Relevant for buyers with children or those concerned about resale value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "postcode": {"type": "string", "description": "UK postcode, e.g. 'E1 6RF'"}
            },
            "required": ["postcode"],
        },
    },
    {
        "name": "search_neighbourhood",
        "description": "Searches for general neighbourhood information, safety sentiment, local amenities, and area character. Use this to supplement factual data with contextual insight.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query, e.g. 'Bethnal Green E2 neighbourhood safety amenities 2024'"}
            },
            "required": ["query"],
        },
    },
]
