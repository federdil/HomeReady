"""
Signal envelope — the single type every external data lookup returns.

The rule this exists to enforce: a caller can never receive a number without
also receiving where it came from and whether it is real. Absent data is
represented explicitly as `unavailable`, never as a default, a zero, or a
midpoint — the scoring engine drops unavailable dimensions and renormalises
rather than imputing them.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class SignalStatus(str, Enum):
    OK = "ok"
    UNAVAILABLE = "unavailable"


class Signal(BaseModel, Generic[T]):
    status: SignalStatus
    value: T | None = None
    source: str = ""
    source_url: str | None = None
    fetched_at: datetime | None = None
    # Populated only when status is UNAVAILABLE — shown to the user verbatim,
    # so write it for a buyer, not for a log.
    reason: str | None = None

    @property
    def ok(self) -> bool:
        return self.status is SignalStatus.OK

    @classmethod
    def found(
        cls,
        value: T,
        source: str,
        source_url: str | None = None,
    ) -> "Signal[T]":
        return cls(
            status=SignalStatus.OK,
            value=value,
            source=source,
            source_url=source_url,
            fetched_at=datetime.now(timezone.utc),
        )

    @classmethod
    def missing(
        cls,
        reason: str,
        source: str = "",
        source_url: str | None = None,
    ) -> "Signal[T]":
        return cls(
            status=SignalStatus.UNAVAILABLE,
            value=None,
            source=source,
            source_url=source_url,
            fetched_at=datetime.now(timezone.utc),
            reason=reason,
        )


def unwrap(signal: Signal[Any], default: Any = None) -> Any:
    """Read a signal's value for display. Never use this to feed scoring —
    scoring must branch on `.ok` so unavailable dimensions drop out."""
    return signal.value if signal.ok else default
