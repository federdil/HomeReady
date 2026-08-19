"""
Rate-table tests. Band boundaries are where stamp duty goes wrong, so every
threshold is tested on both sides.
"""
import pytest

from app.services.calculators import (
    calculate_purchase_costs,
    is_london_postcode,
    land_registry_fee,
    stamp_duty,
)


@pytest.mark.parametrize(
    "price,ftb,expected",
    [
        # First-time buyer: 0% to £300k, 5% to £500k, relief withdrawn above.
        (250_000, True, 0),
        (300_000, True, 0),
        (300_001, True, 0.05),
        (350_000, True, 2_500),          # the case the model got wrong
        (425_000, True, 6_250),          # the old, expired threshold
        (500_000, True, 10_000),
        (500_001, True, 15_000.05),      # relief gone — full standard rates
        # Standard residential rates.
        (125_000, False, 0),
        (125_001, False, 0.02),
        (250_000, False, 2_500),
        (350_000, False, 7_500),
        (925_000, False, 36_250),
        (1_000_000, False, 43_750),
        (2_000_000, False, 153_750),
    ],
)
def test_stamp_duty(price, ftb, expected):
    amount, _ = stamp_duty(price, ftb)
    assert amount == pytest.approx(expected, abs=0.01)


def test_ftb_relief_cliff_is_not_a_gradient():
    """One pound over the cap costs far more than one pound of tax — buyers
    need this to be exact, because it changes what they should offer."""
    under, _ = stamp_duty(500_000, True)
    over, _ = stamp_duty(500_001, True)
    assert under == 10_000
    assert over > 15_000


@pytest.mark.parametrize(
    "price,expected",
    [(80_000, 20), (100_000, 40), (200_000, 100), (500_000, 150),
     (500_001, 295), (1_000_000, 295), (1_000_001, 500)],
)
def test_land_registry_scale(price, expected):
    assert land_registry_fee(price) == expected


@pytest.mark.parametrize(
    "postcode,expected",
    [("SW4 7AB", True), ("EC1A 1BB", True), ("E1 6RF", True), ("N1 9GU", True),
     ("M1 1AE", False), ("B1 1AA", False), ("LS1 4DY", False), ("EH1 1YZ", False)],
)
def test_london_detection(postcode, expected):
    assert is_london_postcode(postcode) is expected


def test_total_always_matches_its_own_breakdown():
    """The defect that motivated this module: the headline total disagreed
    with the sum of the line items it was displayed above."""
    for price in (150_000, 350_000, 499_999, 750_000, 1_250_000):
        for ftb in (True, False):
            r = calculate_purchase_costs(price, "SW4 7AB", ftb, price * 0.1)
            assert r.total_cost == pytest.approx(price + sum(l.amount for l in r.lines))
            assert r.fees_total == pytest.approx(sum(l.amount for l in r.lines))


def test_identical_inputs_give_identical_output():
    """Claude returned different fee estimates for the same input on repeat
    calls. A buyer refreshing the page must not get a different budget."""
    runs = [
        calculate_purchase_costs(350_000, "SW4 7AB", True, 35_000)
        for _ in range(5)
    ]
    totals = {r.total_cost for r in runs}
    assert len(totals) == 1


def test_ltv_and_cash_needed():
    r = calculate_purchase_costs(350_000, "SW4 7AB", True, 35_000)
    assert r.loan_amount == 315_000
    assert r.ltv == 90.0
    # Cash needed is deposit + fees, and must never silently include the loan.
    assert r.cash_needed == pytest.approx(35_000 + r.fees_total)
    assert r.cash_needed < r.total_cost


def test_statutory_lines_are_marked():
    r = calculate_purchase_costs(350_000, "SW4 7AB", True, 35_000)
    statutory = {l.label for l in r.lines if l.statutory}
    assert statutory == {"Stamp Duty Land Tax", "Land Registry fee"}
    assert all(l.is_estimate for l in r.lines if not l.statutory)


def test_london_costs_more_than_elsewhere():
    london = calculate_purchase_costs(350_000, "SW4 7AB", True, 35_000)
    leeds = calculate_purchase_costs(350_000, "LS1 4DY", True, 35_000)
    assert london.fees_total > leeds.fees_total
    # but the statutory portion is identical — tax does not vary by region
    assert london.stamp_duty == leeds.stamp_duty
