"""
Recent sold prices, via HM Land Registry Price Paid data (free, no key).

Answers the question a buyer actually has — "am I overpaying?" — with what
neighbours actually paid, rather than with an asking price the agent chose.

Sold prices are registered some weeks after completion and reflect the market
at the point of sale, so the median here is a reference point, not a valuation.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import datetime

import structlog

from app.core.signals import Signal
from app.services.providers.http import client

log = structlog.get_logger()

SOURCE = "HM Land Registry Price Paid"
ENDPOINT = "https://landregistry.data.gov.uk/data/ppi/transaction-record.json"


@dataclass
class Sale:
    price: int
    date: str
    address: str
    property_type: str | None


@dataclass
class Comparables:
    postcode: str
    sales: list[Sale] = field(default_factory=list)

    @property
    def median_price(self) -> int:
        return int(statistics.median(s.price for s in self.sales)) if self.sales else 0

    def as_dict(self) -> dict:
        return {
            "postcode": self.postcode,
            "median_price": self.median_price,
            "sales": [
                {
                    "price": s.price,
                    "date": s.date,
                    "address": s.address,
                    "property_type": s.property_type,
                }
                for s in self.sales
            ],
        }

    def position_of(self, asking_price: float) -> float | None:
        """How the asking price compares with the local median, as a percentage
        difference. Positive means above the median."""
        median = self.median_price
        if not median:
            return None
        return round(((asking_price - median) / median) * 100, 1)


# Land Registry returns RFC-style dates ("Tue, 12 Mar 2024"), not ISO — the
# ISO form is accepted too in case the representation changes.
_DATE_FORMATS = ("%a, %d %b %Y", "%Y-%m-%d")


def _format_date(raw: str) -> str:
    candidate = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(candidate, fmt).strftime("%b %Y")
        except ValueError:
            continue
    # ISO datetimes carry a time component; retry on the date part alone.
    try:
        return datetime.strptime(candidate[:10], "%Y-%m-%d").strftime("%b %Y")
    except ValueError:
        return candidate


def _address_of(record: dict) -> str:
    addr = record.get("propertyAddress") or {}
    parts = [
        str(addr.get("paon", "")).strip(),
        str(addr.get("saon", "")).strip(),
        str(addr.get("street", "")).strip().title(),
    ]
    return " ".join(p for p in parts if p) or "Address withheld"


def _type_of(record: dict) -> str | None:
    pt = record.get("propertyType")
    if isinstance(pt, dict):
        label = pt.get("prefLabel") or pt.get("label")
        if isinstance(label, list) and label:
            label = label[0]
        if isinstance(label, dict):
            label = label.get("_value")
        return str(label) if label else None
    return None


async def sold_prices(postcode: str, limit: int = 12) -> Signal[Comparables]:
    formatted = postcode.strip().upper()
    if not formatted:
        return Signal.missing("No postcode to look up.", source=SOURCE)

    try:
        resp = await client.get(
            ENDPOINT,
            params={
                "propertyAddress.postcode": formatted,
                "_pageSize": limit,
                "_sort": "-transactionDate",
            },
            headers={"Accept": "application/json"},
        )
    except Exception as e:
        log.warning("land_registry_failed", postcode=formatted, error=str(e))
        return Signal.missing("Couldn't reach the Land Registry service.", source=SOURCE)

    if resp.status_code != 200:
        return Signal.missing("The Land Registry service returned an error.", source=SOURCE)

    try:
        items = (resp.json().get("result") or {}).get("items") or []
    except Exception:
        return Signal.missing("Land Registry returned an unreadable response.", source=SOURCE)

    sales: list[Sale] = []
    for record in items:
        price = record.get("pricePaid")
        if not isinstance(price, (int, float)) or price <= 0:
            continue
        pretty = _format_date(str(record.get("transactionDate") or ""))
        sales.append(
            Sale(
                price=int(price),
                date=pretty,
                address=_address_of(record),
                property_type=_type_of(record),
            )
        )

    if not sales:
        return Signal.missing(
            f"No sales registered for {formatted} — this is common for new-build "
            "or recently created postcodes.",
            source=SOURCE,
        )

    return Signal.found(
        Comparables(postcode=formatted, sales=sales),
        source=SOURCE,
        source_url=f"https://landregistry.data.gov.uk/app/ppd/?postcode={formatted}",
    )
