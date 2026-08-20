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


# ── The London boundary ────────────────────────────────────────────────────
# HomeReady covers London because TfL's journey planner does. A workplace or a
# preferred area outside it is not a lookup that failed — it resolves perfectly
# well — so it has to be refused explicitly, or every property gets scored
# against a journey nobody can plan.

from app.services.providers import geocode  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _postcode_payload(**overrides):
    base = {
        "postcode": "E2 9FJ", "latitude": 51.531282, "longitude": -0.05633,
        "eastings": 535_000, "northings": 182_000, "admin_district": "Tower Hamlets",
        "admin_ward": "Bethnal Green West", "region": "London",
        "lsoa": "Tower Hamlets 015A", "codes": {"lsoa": "E01004304"},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_a_london_postcode_resolves(monkeypatch):
    async def fake_get(url, **kwargs):
        return _FakeResponse(200, {"result": _postcode_payload()})

    monkeypatch.setattr(geocode.client, "get", fake_get)
    signal = await geocode.geocode_address("E2 9FJ")
    assert signal.ok
    assert signal.value.is_london


@pytest.mark.asyncio
async def test_a_valid_postcode_outside_london_is_refused_by_name(monkeypatch):
    """Manchester is a real postcode that resolves cleanly. Accepting it would
    leave every commute unscored with no explanation."""
    async def fake_get(url, **kwargs):
        return _FakeResponse(200, {"result": _postcode_payload(
            postcode="M1 1AE", latitude=53.4794, longitude=-2.2359,
            admin_district="Manchester", region="North West",
        )})

    monkeypatch.setattr(geocode.client, "get", fake_get)
    signal = await geocode.geocode_address("M1 1AE")
    assert not signal.ok
    assert "Manchester" in signal.reason
    assert "London" in signal.reason


@pytest.mark.asyncio
async def test_the_home_counties_are_outside_london(monkeypatch):
    """The reason a bounding box is not enough: Watford sits inside any
    rectangle drawn round London, and is not in it."""
    async def fake_get(url, **kwargs):
        return _FakeResponse(200, {"result": _postcode_payload(
            postcode="WD17 2DN", latitude=51.6562, longitude=-0.3903,
            admin_district="Watford", region="East of England",
        )})

    monkeypatch.setattr(geocode.client, "get", fake_get)
    assert not (await geocode.geocode_address("WD17 2DN")).ok


@pytest.mark.asyncio
async def test_a_place_name_is_checked_against_the_boundary_not_the_search_box(
    monkeypatch,
):
    """OpenStreetMap answers with coordinates, not a region. Those coordinates
    are reverse-looked-up before anything is accepted."""
    async def fake_get(url, **kwargs):
        if "postcodes.io/postcodes/" in url:
            return _FakeResponse(404, {})
        if "nominatim" in url:
            return _FakeResponse(200, [{"lat": "51.6562", "lon": "-0.3903"}])
        # The reverse lookup.
        return _FakeResponse(200, {"result": [_postcode_payload(
            postcode="WD17 2DN", admin_district="Watford",
            region="East of England",
        )]})

    monkeypatch.setattr(geocode.client, "get", fake_get)
    signal = await geocode.geocode_address("Watford Junction")
    assert not signal.ok
    assert "Watford" in signal.reason


@pytest.mark.asyncio
async def test_an_unconfirmable_place_is_refused_rather_than_assumed_london(
    monkeypatch,
):
    """No nearby postcode means no way to check the region. Accepting it would
    put a pin somewhere we cannot score."""
    async def fake_get(url, **kwargs):
        if "postcodes.io/postcodes/" in url:
            return _FakeResponse(404, {})
        if "nominatim" in url:
            return _FakeResponse(200, [{"lat": "51.5", "lon": "-0.1"}])
        return _FakeResponse(200, {"result": []})

    monkeypatch.setattr(geocode.client, "get", fake_get)
    assert not (await geocode.geocode_address("Somewhere odd")).ok
