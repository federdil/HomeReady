"""
Rightmove listing fetcher.
Extracts structured data from a Rightmove property URL by parsing
the window.__PAGE_MODEL indexed JSON blob embedded in the page HTML.

Rightmove uses a custom indexed serialisation format:
  window.__PAGE_MODEL = {"data": "[<indexed-array-JSON>]", "encoding": "on"}

The data string is a JSON array where element 0 is a field→index schema map,
and all subsequent elements are either primitive values or sub-schema maps.
Every "object" in the array is also an index map; leaf values are primitives.
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


def _decode_page_model(html: str) -> dict:
    """
    Extract and decode window.__PAGE_MODEL from Rightmove HTML.

    The outer value is {"data": "<json-string>", "encoding": "on"}.
    Parsing the data string yields an array where:
      - arr[0] maps top-level field names → indices
      - arr[arr[0]['propertyData']] maps propertyData field names → indices
      - Leaf values (str, int, bool, None) are stored directly at their index
      - Sub-objects are themselves index maps (dict of fieldName → int)
    """
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script"):
        text = script.string or ""
        if "window.__PAGE_MODEL" not in text:
            continue
        idx = text.index("window.__PAGE_MODEL")
        after = text[idx + len("window.__PAGE_MODEL"):].lstrip().lstrip("=").lstrip()
        try:
            decoder = json.JSONDecoder()
            outer, _ = decoder.raw_decode(after)
            arr = json.loads(outer["data"])
            root_schema = arr[0]
            pd_idx = root_schema["propertyData"]
            return arr, arr[pd_idx]
        except (json.JSONDecodeError, KeyError, TypeError, IndexError):
            continue
    return None, None


def _get(arr, schema, *keys):
    """Walk a chain of keys through the indexed array, returning the leaf value."""
    node = schema
    for key in keys:
        if not isinstance(node, dict) or key not in node:
            return None
        idx = node[key]
        node = arr[idx]
    return node if not isinstance(node, dict) else None


def _get_list(arr, schema, key):
    """Return a list decoded from the indexed array for an array-valued field."""
    if not isinstance(schema, dict) or key not in schema:
        return []
    idx = schema[key]
    val = arr[idx]
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        # Indexed list: keys are "0","1",... or integer indices
        result = []
        for i in range(len(val)):
            item_idx = val.get(str(i)) or val.get(i)
            if item_idx is not None:
                result.append(arr[item_idx])
        return result
    return []


def _parse_page(html: str, url: str) -> dict:
    arr, pd = _decode_page_model(html)

    if arr is None or pd is None:
        return _extract_from_html(BeautifulSoup(html, "html.parser"), url)

    try:
        return _extract_from_page_model(arr, pd, url)
    except Exception as e:
        log.warning("rightmove_page_model_extract_failed", error=str(e))
        return _extract_from_html(BeautifulSoup(html, "html.parser"), url)


def _extract_from_page_model(arr: list, pd: dict, url: str) -> dict:
    # Address
    addr_schema_idx = pd.get("address")
    addr_schema = arr[addr_schema_idx] if addr_schema_idx is not None else {}
    address = _get(arr, addr_schema, "displayAddress") or ""
    outcode = _get(arr, addr_schema, "outcode") or ""
    incode = _get(arr, addr_schema, "incode") or ""
    postcode = f"{outcode} {incode}".strip()

    # Price
    price_schema_idx = pd.get("prices")
    price_schema = arr[price_schema_idx] if price_schema_idx is not None else {}
    price_raw = _get(arr, price_schema, "primaryPrice")
    price_int = None
    if price_raw:
        digits = re.sub(r"[^\d]", "", str(price_raw))
        price_int = int(digits) if digits else None

    # Property details
    bedrooms = arr[pd["bedrooms"]] if "bedrooms" in pd else None
    bathrooms = arr[pd["bathrooms"]] if "bathrooms" in pd else None

    prop_sub_type_idx = pd.get("propertySubType")
    prop_type_idx = pd.get("soldPropertyType") or pd.get("propertySubType")
    property_type = ""
    if prop_sub_type_idx is not None:
        v = arr[prop_sub_type_idx]
        if isinstance(v, str):
            property_type = v
    if not property_type and prop_type_idx is not None:
        v = arr[prop_type_idx]
        if isinstance(v, str):
            property_type = v

    # Description & text
    text_schema_idx = pd.get("text")
    text_schema = arr[text_schema_idx] if text_schema_idx is not None else {}
    description_raw = _get(arr, text_schema, "description") or ""
    # Strip HTML tags — Rightmove embeds <br /> etc. in the description
    description = re.sub(r"<[^>]+>", " ", description_raw).strip()
    description = re.sub(r"\s{2,}", " ", description)

    # Key features (indexed list)
    kf_idx = pd.get("keyFeatures")
    key_features = []
    if kf_idx is not None:
        kf_val = arr[kf_idx]
        if isinstance(kf_val, list):
            key_features = [arr[i] if isinstance(i, int) else i for i in kf_val]
        elif isinstance(kf_val, dict):
            for i in range(len(kf_val)):
                item_idx = kf_val.get(str(i)) or kf_val.get(i)
                if item_idx is not None:
                    f = arr[item_idx]
                    if isinstance(f, str):
                        key_features.append(f)

    # Tenure
    tenure_schema_idx = pd.get("tenure")
    tenure_schema = arr[tenure_schema_idx] if tenure_schema_idx is not None else {}
    tenure_type = _get(arr, tenure_schema, "tenureType") or ""
    lease_years = _get(arr, tenure_schema, "yearsRemainingOnLease")

    # Listing history / days on market
    lh_schema_idx = pd.get("listingHistory")
    lh_schema = arr[lh_schema_idx] if lh_schema_idx is not None else {}
    days_on_market = None
    reduction_count = 0
    if isinstance(lh_schema, dict):
        dom = _get(arr, lh_schema, "daysOnMarket")
        if isinstance(dom, int):
            days_on_market = dom
        # Count price reductions from history items
        items_idx = lh_schema.get("listingHistoryItems")
        if items_idx is not None:
            items_val = arr[items_idx]
            items = []
            if isinstance(items_val, list):
                items = [arr[i] if isinstance(i, int) else i for i in items_val]
            elif isinstance(items_val, dict):
                for i in range(len(items_val)):
                    ii = items_val.get(str(i)) or items_val.get(i)
                    if ii is not None:
                        item = arr[ii]
                        if isinstance(item, dict):
                            reason_idx = item.get("listingUpdateReason")
                            if reason_idx is not None:
                                reason = arr[reason_idx]
                                if isinstance(reason, str) and "reduc" in reason.lower():
                                    reduction_count += 1

    # Photo count
    images_idx = pd.get("images")
    photo_count = 0
    if images_idx is not None:
        img_val = arr[images_idx]
        if isinstance(img_val, list):
            photo_count = len(img_val)
        elif isinstance(img_val, dict):
            photo_count = len(img_val)

    # EPC
    epc_idx = pd.get("epcGraphs")
    epc_rating = None
    # EPC is complex nested; skip for now unless simple
    if epc_idx is not None:
        epc_val = arr[epc_idx]
        if isinstance(epc_val, dict):
            eer_idx = epc_val.get("eer")
            if eer_idx is not None:
                eer_schema = arr[eer_idx]
                if isinstance(eer_schema, dict):
                    curr_idx = eer_schema.get("current")
                    if curr_idx is not None:
                        epc_rating = arr[curr_idx]

    # Build text block for Claude
    parts = []
    if address:
        parts.append(f"Address: {address}")
    if postcode:
        parts.append(f"Postcode: {postcode}")
    if price_int is not None:
        parts.append(f"Asking price: £{price_int:,}")
    if property_type:
        parts.append(f"Property type: {property_type}")
    if bedrooms is not None:
        parts.append(f"Bedrooms: {bedrooms}")
    if bathrooms is not None:
        parts.append(f"Bathrooms: {bathrooms}")
    if tenure_type:
        parts.append(
            f"Tenure: {tenure_type}"
            + (f" ({lease_years} years remaining)" if lease_years else "")
        )
    if days_on_market is not None:
        parts.append(f"Days on market: {days_on_market}")
    if reduction_count > 0:
        parts.append(f"Price reductions: {reduction_count}")
    if photo_count:
        parts.append(f"Number of listing photos: {photo_count}")
    if epc_rating:
        parts.append(f"EPC rating: {epc_rating}")
    if key_features:
        parts.append("Key features:\n" + "\n".join(f"- {f}" for f in key_features))
    if description:
        parts.append(f"Description:\n{description}")

    if not parts:
        raise RightmoveError(
            "Could not extract data from this Rightmove listing. "
            "Please paste the listing text manually."
        )

    return {
        "listing_text": "\n".join(parts),
        "address": address,
        "postcode": postcode,
        "price": price_int,
        "property_type": property_type.lower() if property_type else "",
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
