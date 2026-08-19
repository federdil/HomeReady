"""Shared HTTP client for signal providers.

One client, one place to set timeouts and identify ourselves politely to the
public APIs we depend on.
"""
import httpx

# Public-sector APIs are generally fast; a provider that cannot answer in ten
# seconds should degrade to `unavailable` rather than hold up the fan-out.
TIMEOUT = httpx.Timeout(10.0, connect=5.0)

client = httpx.AsyncClient(
    timeout=TIMEOUT,
    headers={"User-Agent": "HomeReady/2.0 (UK first-time buyer research tool)"},
    follow_redirects=True,
)


async def close() -> None:
    await client.aclose()
