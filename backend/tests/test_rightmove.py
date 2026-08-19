"""
Rightmove fetch policy.

The case that motivated this: a user pasted a link to a listing that had been
sold, and got "Rightmove returned an unexpected error (410)". Rightmove serves
410 for listings no longer advertised, but the page still contains the complete
property data — so the listing should be parsed and flagged, not discarded.
"""
import pytest

from app.services import rightmove
from app.services.rightmove import RightmoveError, extract_property_id, fetch_listing


class _FakeResponse:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


class _FakeClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return self._response


@pytest.fixture
def gone_page():
    with open("tests/fixtures_gone_listing.html", encoding="utf-8", errors="replace") as f:
        return f.read()


def _patch(monkeypatch, response):
    monkeypatch.setattr(
        rightmove.httpx, "AsyncClient", lambda **kw: _FakeClient(response)
    )


@pytest.mark.asyncio
async def test_gone_listing_is_parsed_and_flagged_inactive(monkeypatch, gone_page):
    _patch(monkeypatch, _FakeResponse(410, gone_page))
    listing = await fetch_listing("https://www.rightmove.co.uk/properties/155000000")
    assert listing["is_active"] is False
    # The data is all still there — that is the whole point of not erroring.
    assert listing["bedrooms"] == 2
    assert listing["price"] == 45518


@pytest.mark.asyncio
async def test_live_listing_is_flagged_active(monkeypatch, gone_page):
    _patch(monkeypatch, _FakeResponse(200, gone_page))
    listing = await fetch_listing("https://www.rightmove.co.uk/properties/155000000")
    assert listing["is_active"] is True


@pytest.mark.parametrize("status", [403, 429])
@pytest.mark.asyncio
async def test_blocking_is_reported_as_blocking(monkeypatch, status):
    _patch(monkeypatch, _FakeResponse(status, ""))
    with pytest.raises(RightmoveError, match="blocked"):
        await fetch_listing("https://www.rightmove.co.uk/properties/1")


@pytest.mark.asyncio
async def test_missing_listing_still_errors(monkeypatch):
    _patch(monkeypatch, _FakeResponse(404, ""))
    with pytest.raises(RightmoveError, match="wasn't found"):
        await fetch_listing("https://www.rightmove.co.uk/properties/1")


@pytest.mark.asyncio
async def test_genuinely_unexpected_status_still_errors(monkeypatch):
    _patch(monkeypatch, _FakeResponse(500, ""))
    with pytest.raises(RightmoveError, match="500"):
        await fetch_listing("https://www.rightmove.co.uk/properties/1")


def test_url_must_be_a_property_link():
    with pytest.raises(RightmoveError):
        extract_property_id("https://www.rightmove.co.uk/house-prices/SW4.html")
    assert extract_property_id("https://www.rightmove.co.uk/properties/12345678#/") == "12345678"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Bent House Lane,\r\nGilesgate,\r\nDurham,\r\nDH1 2EA",
         "Bent House Lane, Gilesgate, Durham, DH1 2EA"),
        ("  Forester Avenue,  Much Wenlock  ", "Forester Avenue, Much Wenlock"),
        ("Noel Road, London,", "Noel Road, London"),
        ("", ""),
    ],
)
def test_multiline_addresses_render_on_one_line(raw, expected):
    from app.services.rightmove import _normalise_address
    assert _normalise_address(raw) == expected
