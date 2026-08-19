"""Signal providers — one module per external data source.

Each public function returns a Signal, never a bare value, so an absent answer
is always distinguishable from a real one.
"""
from app.services.providers import comparables, commute, crime, geocode, http, schools

__all__ = ["comparables", "commute", "crime", "geocode", "http", "schools"]
