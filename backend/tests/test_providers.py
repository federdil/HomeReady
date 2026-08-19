"""Provider parsing tests — formats that come back from live public APIs."""
import pytest

from app.services.providers.comparables import _format_date


@pytest.mark.parametrize(
    "raw,expected",
    [
        # What HM Land Registry actually returns.
        ("Tue, 12 Mar 2024", "Mar 2024"),
        ("Wed, 31 Jan 2024", "Jan 2024"),
        ("Thu, 16 Feb 2023", "Feb 2023"),
        # ISO forms, in case the representation changes.
        ("2024-03-12", "Mar 2024"),
        ("2024-03-12T00:00:00", "Mar 2024"),
    ],
)
def test_land_registry_dates_keep_their_year(raw, expected):
    assert _format_date(raw) == expected


def test_unparseable_date_is_passed_through_not_truncated():
    assert _format_date("sometime in 2024") == "sometime in 2024"


# ── Running costs ──────────────────────────────────────────────────────────
from app.services.running_costs import build_running_costs, estimate_council_tax


def test_council_tax_scales_with_band():
    a = estimate_council_tax("A")[0]
    d = estimate_council_tax("D")[0]
    h = estimate_council_tax("H")[0]
    assert a < d < h
    assert h == pytest.approx(a * 3, rel=0.02)   # statutory 18/9 vs 6/9


def test_tbc_band_is_absence_not_a_band():
    """Rightmove writes the literal string TBC when the agent hasn't supplied
    a band — treating that as a band would invent a bill."""
    for raw in ("TBC", "tbc", "", None, "Not available"):
        assert estimate_council_tax(raw)[0] is None


def test_service_charge_is_a_stated_fact_not_an_estimate():
    signal = build_running_costs({
        "price": 500_000, "annual_service_charge": 3200, "council_tax_band": "D",
    })
    assert signal.ok
    by_label = {l.label: l for l in signal.value.lines}
    assert by_label["Service charge"].is_estimate is False
    assert by_label["Council tax"].is_estimate is True


def test_price_per_sqft_needs_both_price_and_area():
    with_area = build_running_costs({
        "price": 800_000, "floor_area_sqft": 800, "annual_service_charge": 2000,
    })
    assert with_area.value.price_per_sqft == 1000
    without = build_running_costs({"price": 800_000, "annual_service_charge": 2000})
    assert without.value.price_per_sqft is None


def test_leasehold_with_no_costs_gets_a_pointed_reason():
    signal = build_running_costs({"price": 500_000, "tenure_type": "LEASEHOLD"})
    assert not signal.ok
    assert "leasehold" in signal.reason.lower()
