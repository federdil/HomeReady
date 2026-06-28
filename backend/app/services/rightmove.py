"""
Rightmove listing fetcher.
Extracts structured data from a Rightmove property URL by parsing
the __NEXT_DATA__ JSON blob embedded in the page HTML.
"""
import json
import re
import httpx
from bs4 import BeautifulSoup
import structlog

log = structlog.get_logger()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RIGHTMOVE_PATTERN = re.compile(
    r"rightmove\.co\.uk/properties/(\d+)", re.IGNORECASE
)


class RightmoveError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.user_message = message


def extract_property_id(url: str) -> str:
    m = RIGHTMOVE_PATTERN.search(url)
    if not m:
        raise RightmoveError(
            "That doesn't look like a Rightmove property URL. "
            "It should contain /properties/12345678."
        )
    return m.group(1)


async def fetch_listing(url: str) -> dict:
    """
    Fetch a Rightmove listing and return a structured dict with all
    useful fields for the listing decoder and shortlist.
    """
    property_id = extract_property_id(url)
    canonical_url = f"https://www.rightmove.co.uk/properties/{property_id}"

    log.info("rightmove_fetch", property_id=property_id)

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        try:
            resp = await client.get(canonical_url, headers=HEADERS)
        except httpx.TimeoutException:
            raise RightmoveError(
                "Rightmove took too long to respond. Try again or paste the listing text manually."
            )
        except httpx.RequestError as e:
            raise RightmoveError(
                "Could not reach Rightmove. Check the URL or paste the listing text manually."
            )

    if resp.status_code == 403 or resp.status_code == 429:
        raise RightmoveError(
            "Rightmove blocked this request. Please paste the listing text manually instead."
        )
    if resp.status_code == 404:
        raise RightmoveError(
            "That property listing wasn't found — it may have been removed from Rightmove."
        )
    if resp.status_code != 200:
        raise RightmoveError(
            f"Rightmove returned an unexpected error ({resp.status_code}). "
            "Try pasting the listing text manually."
        )

    return _parse_page(resp.text, canonical_url)


def _parse_page(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    # Primary: __NEXT_DATA__ JSON blob
    next_data_tag = soup.find("script", {"id": "__NEXT_DATA__"})
    if next_data_tag:
        try:
            data = json.loads(next_data_tag.string)
            return _extract_from_next_data(data, url)
        except (json.JSONDecodeError, KeyError, TypeError):
            log.warning("rightmove_next_data_parse_failed")

    # Fallback: scrape visible text
    return _extract_from_html(soup, url)


def _extract_from_next_data(data: dict, url: str) -> dict:
    props = data.get("props", {}).get("pageProps", {})
    pd = props.get("propertyData", {})

    if not pd:
        raise RightmoveError(
            "Could not read the listing data from Rightmove. "
            "Try pasting the listing text manually."
        )

    # Address
    address_obj = pd.get("address", {})
    address = address_obj.get("displayAddress", "")
    postcode = address_obj.get("outcode", "") + " " + address_obj.get("incode", "")
    postcode = postcode.strip()

    # Price
    price_obj = pd.get("prices", pd.get("price", {}))
    price = (
        price_obj.get("primaryPrice")
        or price_obj.get("amount")
        or price_obj.get("displayPrice", "")
    )
    # Strip non-numeric for storage
    price_int = None
    if price:
        digits = re.sub(r"[^\d]", "", str(price))
        price_int = int(digits) if digits else None

    # Property details
    property_type = pd.get("propertySubType") or pd.get("propertyType") or ""
    bedrooms = pd.get("bedrooms")
    bathrooms = pd.get("bathrooms")

    # Description
    text_obj = pd.get("text", {})
    description = text_obj.get("description", "")
    key_features = pd.get("keyFeatures", [])

    # Tenure
    tenure_obj = pd.get("tenure", {})
    tenure_type = tenure_obj.get("tenureType", "")
    lease_years = tenure_obj.get("yearsRemainingOnLease")

    # Market info
    listing_history = pd.get("listingHistory", {})
    days_on_market = pd.get("daysOnMarket") or listing_history.get("listingUpdateReason", {})
    # Sometimes it's nested differently
    if not isinstance(days_on_market, int):
        days_on_market = None

    # Price reductions
    price_changes = listing_history.get("listingHistoryItems", [])
    reductions = [
        item for item in price_changes
        if "reduc" in item.get("listingUpdateReason", "").lower()
    ]
    reduction_count = len(reductions)

    # Photo count
    images = pd.get("images", [])
    photo_count = len(images)

    # EPC
    epc = pd.get("epc", {})
    epc_rating = epc.get("eer", {}).get("current") if epc else None

    # Council tax
    council_tax = pd.get("councilTaxBand", "")

    # Build a rich text block for Claude
    parts = []
    if address:
        parts.append(f"Address: {address}")
    if price:
        parts.append(f"Asking price: £{price_int:,}" if price_int else f"Asking price: {price}")
    if property_type:
        parts.append(f"Property type: {property_type}")
    if bedrooms:
        parts.append(f"Bedrooms: {bedrooms}")
    if bathrooms:
        parts.append(f"Bathrooms: {bathrooms}")
    if tenure_type:
        parts.append(f"Tenure: {tenure_type}" + (f" ({lease_years} years remaining)" if lease_years else ""))
    if days_on_market is not None:
        parts.append(f"Days on market: {days_on_market}")
    if reduction_count > 0:
        parts.append(f"Price reductions: {reduction_count}")
    if photo_count:
        parts.append(f"Number of listing photos: {photo_count}")
    if epc_rating:
        parts.append(f"EPC rating: {epc_rating}")
    if council_tax:
        parts.append(f"Council tax band: {council_tax}")
    if key_features:
        parts.append("Key features:\n" + "\n".join(f"- {f}" for f in key_features))
    if description:
        parts.append(f"Description:\n{description}")

    listing_text = "\n".join(parts)

    return {
        "listing_text": listing_text,
        "address": address,
        "postcode": postcode,
        "price": price_int,
        "property_type": property_type,
        "bedrooms": bedrooms,
        "days_on_market": days_on_market,
        "reduction_count": reduction_count,
        "photo_count": photo_count,
        "tenure_type": tenure_type,
        "lease_years": lease_years,
        "epc_rating": epc_rating,
        "rightmove_url": url,
    }


def _extract_from_html(soup: BeautifulSoup, url: str) -> dict:
    """Fallback: extract visible text from HTML when __NEXT_DATA__ isn't available."""
    # Try to grab description from known selectors
    desc_el = (
        soup.find("div", {"data-testid": "truncated-text-container"})
        or soup.find(itemprop="description")
        or soup.find("div", class_=re.compile(r"description", re.I))
    )
    description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

    # Address
    addr_el = soup.find("h1", {"itemprop": "name"}) or soup.find("address")
    address = addr_el.get_text(strip=True) if addr_el else ""

    if not description and not address:
        raise RightmoveError(
            "Could not read this Rightmove listing. "
            "Please paste the listing description text manually."
        )

    return {
        "listing_text": f"Address: {address}\n\nDescription:\n{description}",
        "address": address,
        "postcode": "",
        "price": None,
        "property_type": "",
        "bedrooms": None,
        "days_on_market": None,
        "reduction_count": 0,
        "photo_count": 0,
        "tenure_type": "",
        "lease_years": None,
        "epc_rating": None,
        "rightmove_url": url,
    }
