"""
Deterministic purchase-cost calculation.

Everything here was previously asked of Claude, which produced totals that did
not match their own itemisation and applied a first-time-buyer threshold that
expired in April 2025. Rates live in tables so they can be audited and updated
in one place instead of depending on model recall.

Two classes of cost, and the distinction is shown to the user:
  * statutory — SDLT and Land Registry. Exact, computed from published scales.
  * estimate  — solicitor, survey, removals. Real ranges, deterministic within
                a price band, and labelled so nobody mistakes them for quotes.

RATES EFFECTIVE 2025-04-01. Verify against HMRC and HM Land Registry before
any public launch; both tables are the only place a change is needed.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Surfaced in the API response so the UI can show which rate set produced the
# figures, and so a stale deployment is visible rather than silent.
RATES_EFFECTIVE_FROM = "2025-04-01"

# ── Stamp Duty Land Tax — England & Northern Ireland, from 1 April 2025 ─────
# Bands are (upper_bound_inclusive, marginal_rate). Final band is unbounded.
SDLT_STANDARD_BANDS: list[tuple[float, float]] = [
    (125_000, 0.00),
    (250_000, 0.02),
    (925_000, 0.05),
    (1_500_000, 0.10),
    (float("inf"), 0.12),
]

# First-time buyer relief. Withdrawn entirely above the cap — a £500,001
# purchase pays full standard rates, not relieved rates.
SDLT_FTB_BANDS: list[tuple[float, float]] = [
    (300_000, 0.00),
    (500_000, 0.05),
]
SDLT_FTB_RELIEF_CAP = 500_000.0

# ── HM Land Registry, Scale 1, electronic (e-DRS) lodgement ────────────────
LAND_REGISTRY_SCALE_1: list[tuple[float, float]] = [
    (80_000, 20),
    (100_000, 40),
    (200_000, 100),
    (500_000, 150),
    (1_000_000, 295),
    (float("inf"), 500),
]

# ── Estimate tables ────────────────────────────────────────────────────────
# Deterministic within a band so the same input always yields the same output.
CONVEYANCING_BY_BAND: list[tuple[float, float]] = [
    (250_000, 1_100),
    (500_000, 1_400),
    (1_000_000, 1_850),
    (float("inf"), 2_600),
]
LONDON_CONVEYANCING_UPLIFT = 1.30

SURVEY_FEES = {
    "level_1": [(300_000, 400), (600_000, 500), (float("inf"), 650)],
    "level_2": [(300_000, 500), (600_000, 650), (float("inf"), 900)],
    "level_3": [(300_000, 800), (600_000, 1_100), (float("inf"), 1_600)],
}

MORTGAGE_VALUATION_BY_BAND: list[tuple[float, float]] = [
    (250_000, 150),
    (500_000, 250),
    (1_000_000, 400),
    (float("inf"), 600),
]

REMOVALS_BY_BEDROOMS = {1: 500, 2: 750, 3: 1_100, 4: 1_500}
REMOVALS_DEFAULT = 900
LONDON_REMOVALS_UPLIFT = 1.25

MORTGAGE_ARRANGEMENT_FEE = 999.0
ELECTRONIC_TRANSFER_FEE = 35.0
SEARCHES_FEE = 350.0

LONDON_OUTCODE_PREFIXES = (
    "EC", "WC", "SW", "SE", "NW", "E", "N", "W",
)


def _band_lookup(value: float, table: list[tuple[float, float]]) -> float:
    for upper, result in table:
        if value <= upper:
            return result
    return table[-1][1]


def is_london_postcode(postcode: str) -> bool:
    """Outcode-prefix check. Deliberately offline — the calculator must work
    without a network call. Covers the London postal district, not the M25."""
    outcode = postcode.strip().upper().split()[0] if postcode.strip() else ""
    # Leading letters only — "EC1A" is area EC, not ECA.
    letters = ""
    for char in outcode:
        if not char.isalpha():
            break
        letters += char
    # Longest prefix first so "EC" is not matched as "E".
    for prefix in sorted(LONDON_OUTCODE_PREFIXES, key=len, reverse=True):
        if letters == prefix:
            return True
    return False


def stamp_duty(price: float, is_first_time_buyer: bool) -> tuple[float, str]:
    """Returns (amount, plain-English basis). Progressive: each band's rate
    applies only to the slice of the price falling inside it."""
    if is_first_time_buyer and price <= SDLT_FTB_RELIEF_CAP:
        tax = _progressive(price, SDLT_FTB_BANDS)
        if tax == 0:
            basis = (
                f"First-time buyer relief: nothing to pay on a purchase up to "
                f"£{SDLT_FTB_BANDS[0][0]:,.0f}."
            )
        else:
            basis = (
                f"First-time buyer relief: 0% on the first "
                f"£{SDLT_FTB_BANDS[0][0]:,.0f}, then 5% on the remaining "
                f"£{price - SDLT_FTB_BANDS[0][0]:,.0f}."
            )
        return tax, basis

    tax = _progressive(price, SDLT_STANDARD_BANDS)
    if is_first_time_buyer and price > SDLT_FTB_RELIEF_CAP:
        basis = (
            f"First-time buyer relief does not apply above "
            f"£{SDLT_FTB_RELIEF_CAP:,.0f}, so standard rates are charged in full."
        )
    else:
        basis = "Standard residential rates."
    return tax, basis


def _progressive(price: float, bands: list[tuple[float, float]]) -> float:
    tax = 0.0
    lower = 0.0
    for upper, rate in bands:
        if price <= lower:
            break
        tax += (min(price, upper) - lower) * rate
        lower = upper
    return round(tax, 2)


def land_registry_fee(price: float) -> float:
    return _band_lookup(price, LAND_REGISTRY_SCALE_1)


@dataclass
class CostLine:
    label: str
    amount: float
    basis: str
    statutory: bool = False

    @property
    def is_estimate(self) -> bool:
        return not self.statutory


@dataclass
class CostResult:
    property_price: float
    deposit: float
    stamp_duty: float
    lines: list[CostLine] = field(default_factory=list)

    @property
    def fees_total(self) -> float:
        return round(sum(line.amount for line in self.lines), 2)

    @property
    def total_cost(self) -> float:
        # Property price plus every upfront cost. Derived, never asserted —
        # this is the number that previously disagreed with its own breakdown.
        return round(self.property_price + self.fees_total, 2)

    @property
    def cash_needed(self) -> float:
        """What the buyer actually has to have: deposit plus all fees."""
        return round(self.deposit + self.fees_total, 2)

    @property
    def loan_amount(self) -> float:
        return round(self.property_price - self.deposit, 2)

    @property
    def ltv(self) -> float:
        if self.property_price <= 0:
            return 0.0
        return round((self.loan_amount / self.property_price) * 100, 1)


def calculate_purchase_costs(
    property_price: float,
    postcode: str,
    is_first_time_buyer: bool,
    deposit_amount: float,
    survey_level: str = "level_2",
    bedrooms: int | None = None,
) -> CostResult:
    london = is_london_postcode(postcode)

    sdlt, sdlt_basis = stamp_duty(property_price, is_first_time_buyer)

    conveyancing = _band_lookup(property_price, CONVEYANCING_BY_BAND)
    if london:
        conveyancing = round(conveyancing * LONDON_CONVEYANCING_UPLIFT, -1)

    survey = _band_lookup(property_price, SURVEY_FEES.get(survey_level, SURVEY_FEES["level_2"]))

    removals = REMOVALS_BY_BEDROOMS.get(bedrooms, REMOVALS_DEFAULT) if bedrooms else REMOVALS_DEFAULT
    if london:
        removals = round(removals * LONDON_REMOVALS_UPLIFT, -1)

    survey_label = {
        "level_1": "Survey (Level 1 Condition Report)",
        "level_2": "Survey (Level 2 HomeBuyer Report)",
        "level_3": "Survey (Level 3 Building Survey)",
    }.get(survey_level, "Survey (Level 2 HomeBuyer Report)")

    lines = [
        CostLine(
            "Stamp Duty Land Tax", sdlt, sdlt_basis, statutory=True,
        ),
        CostLine(
            "Land Registry fee", land_registry_fee(property_price),
            "HM Land Registry Scale 1, electronic lodgement — set by price band.",
            statutory=True,
        ),
        CostLine(
            "Solicitor / conveyancing", conveyancing,
            "Typical range for this price band"
            + (", uplifted for London." if london else "."),
        ),
        CostLine(
            "Searches", SEARCHES_FEE,
            "Local authority, drainage and environmental searches.",
        ),
        CostLine(
            survey_label, survey,
            "Recommended at this price point. Cost varies by surveyor and property size.",
        ),
        CostLine(
            "Mortgage arrangement fee", MORTGAGE_ARRANGEMENT_FEE,
            "Typical product fee. Often addable to the loan — which means paying "
            "interest on it for the full term.",
        ),
        CostLine(
            "Mortgage valuation fee", _band_lookup(property_price, MORTGAGE_VALUATION_BY_BAND),
            "Lender's own valuation. Some lenders waive this.",
        ),
        CostLine(
            "Electronic transfer fee", ELECTRONIC_TRANSFER_FEE,
            "Bank transfer of completion funds by your solicitor.",
        ),
        CostLine(
            "Removals", removals,
            "Estimate"
            + (" for a London move." if london else "based on property size."),
        ),
    ]

    return CostResult(
        property_price=property_price,
        deposit=deposit_amount,
        stamp_duty=sdlt,
        lines=lines,
    )
