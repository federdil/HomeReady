"""
Load the DfE "Get Information About Schools" bulk file into the schools table.

Run periodically (the file is republished on working days):

    python -m scripts.load_schools

Why a bulk load rather than a live API: both public schools endpoints the
previous implementation called have been withdrawn — neither hostname resolves
any more — so the published CSV is the only dependable source. Loading it also
means school lookups cost a local index scan instead of a network round trip.
"""
from __future__ import annotations

import asyncio
import csv
import io
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.models import School  # noqa: E402

BASE = "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public"


async def _download() -> str:
    """Today's file is not published until later in the day, so walk back
    until one exists rather than assuming a date."""
    async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
        for days_ago in range(0, 10):
            stamp = (date.today() - timedelta(days=days_ago)).strftime("%Y%m%d")
            url = f"{BASE}/edubasealldata{stamp}.csv"
            resp = await client.get(url)
            if resp.status_code == 200 and len(resp.content) > 1_000_000:
                print(f"  downloaded {stamp} ({len(resp.content) / 1e6:.1f} MB)")
                return resp.content.decode("latin-1")
            print(f"  {stamp}: not available ({resp.status_code})")
    raise RuntimeError("No GIAS file found in the last 10 days.")


def _parse(raw: str) -> list[dict]:
    rows: list[dict] = []
    skipped_closed = 0
    skipped_no_coords = 0

    for row in csv.DictReader(io.StringIO(raw)):
        if (row.get("EstablishmentStatus (name)") or "").strip() != "Open":
            skipped_closed += 1
            continue

        easting = (row.get("Easting") or "").strip()
        northing = (row.get("Northing") or "").strip()
        if not easting.isdigit() or not northing.isdigit():
            skipped_no_coords += 1
            continue
        if easting == "0" or northing == "0":
            skipped_no_coords += 1
            continue

        urn = (row.get("URN") or "").strip()
        if not urn.isdigit():
            continue

        rows.append(
            {
                "urn": int(urn),
                "name": (row.get("EstablishmentName") or "").strip()[:255],
                "postcode": (row.get("Postcode") or "").strip()[:16] or None,
                "phase": (row.get("PhaseOfEducation (name)") or "").strip()[:64] or None,
                "establishment_type": (row.get("TypeOfEstablishment (name)") or "").strip()[:128] or None,
                "easting": int(easting),
                "northing": int(northing),
                "local_authority": (row.get("LA (name)") or "").strip()[:128] or None,
                # GIAS publishes no Ofsted judgement in this file.
                "ofsted_rating": None,
            }
        )

    print(f"  parsed {len(rows):,} open schools with coordinates")
    print(f"  skipped {skipped_closed:,} closed, {skipped_no_coords:,} without coordinates")
    return rows


async def load() -> None:
    print("Loading DfE GIAS establishment data")
    raw = await _download()
    rows = _parse(raw)
    if not rows:
        raise RuntimeError("Parsed zero schools — aborting rather than wiping the table.")

    async with AsyncSessionLocal() as session:
        await session.execute(delete(School))
        for i in range(0, len(rows), 2_000):
            chunk = rows[i : i + 2_000]
            stmt = insert(School).values(chunk)
            await session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["urn"],
                    set_={c: stmt.excluded[c] for c in chunk[0] if c != "urn"},
                )
            )
        await session.commit()

    print(f"  loaded {len(rows):,} schools")


if __name__ == "__main__":
    asyncio.run(load())
