"""
Architectural period and built form — the two things a London buyer describes a
property by long before they mention its floor area.

"A Victorian terrace" and "a new-build tower" are different products with
different problems: sash windows and solid walls against a lift, a concierge and
a service charge. Buyers hold a real preference here, so it belongs in the
persona and in the score rather than being something they re-check by eye on
every listing.

Neither fact is published as structured data. Rightmove exposes a *built form*
("Terraced", "Semi-Detached") and a new-homes channel flag, and nothing at all
about period — that lives in the prose. So this module reads three sources, in
descending order of authority:

  1. Rightmove's new-homes channel — the portal's own classification, and the
     only period fact anyone declares.
  2. A model reading the description, folded into the verdict call, which can
     tell "an original Victorian terrace" from "opposite the Victorian
     schoolhouse".
  3. A conservative phrase scan, so a period shows up on the very first
     assessment instead of waiting for the verdict call.

The phrase scan only ever asserts a period it has positive evidence for. Silence
stays silence — see app/services/features_match.py for why that distinction is
enforced everywhere in this codebase.
"""
from __future__ import annotations

import re

# ── Period ─────────────────────────────────────────────────────────────────
# Ordered oldest to newest, which is the order they are offered in the UI.
#
# Named and described as *the kind of building you would be living in* rather
# than as a date range, because that is the choice people are actually making. A
# buyer does not want "1837–1901", they want bay windows and a fireplace, or a
# lift and a concierge — and a bare date tells them neither. Each blurb is there
# to be recognised: someone who reads "mock-Tudor gable and room for a car"
# knows immediately whether that is the house they picture.
#
# The blurbs describe what these buildings are typically like. They are not
# claims about any individual listing: amenities are not a scored attribute, so
# a new-build tower without a pool still matches "new build".
PERIODS: tuple[tuple[str, str, str], ...] = (
    ("georgian", "Georgian townhouse",
     "Tall sash windows, high ceilings, iron railings. Pre-1837, often listed, "
     "and expensive to keep that way."),
    ("victorian", "Victorian terrace or conversion",
     "Bay windows, cornicing, original fireplaces. Most of inner London looks "
     "like this, and most of it is now flats."),
    ("edwardian", "Edwardian house",
     "Wider hallways and longer gardens than Victorian, in London's first "
     "commuter suburbs."),
    ("interwar", "1930s semi",
     "Bay-fronted, mock-Tudor gable, room for a car. The outer-London staple, "
     "and the easiest of these to extend."),
    ("postwar", "Post-war block or estate",
     "Solid construction and rooms bigger than anything built since. Often "
     "ex-local-authority, and priced below the street it stands on."),
    ("modern", "Modern block",
     "Purpose-built flats from the 1980s to the 2000s. Lift, secure entry, "
     "double glazing, lower ceilings."),
    ("new_build", "New-build tower or development",
     "Concierge, gym, sometimes a pool. No chain and a ten-year warranty — and "
     "a service charge to match."),
)
PERIOD_KEYS = tuple(key for key, _, _ in PERIODS)
PERIOD_LABELS = {key: label for key, label, _ in PERIODS}
PERIOD_BLURBS = {key: blurb for key, _, blurb in PERIODS}

# Matched case-insensitively against the key features and description, as whole
# words. Every phrase here has to be one that a listing uses *only* about the
# building's own age, which rules out a lot of language that sounds like it
# qualifies:
#
#   "period"     — "the period remaining on the lease"
#   "character"  — says nothing about a date
#   "new home"   — "welcome to your new home", in half of all listings
#   "brand new"  — overwhelmingly a fitting or the listing itself: "a brand new
#                  kitchen", "brand new to the market". Observed as a false
#                  positive on a South Kensington flat that is nothing of the
#                  kind.
#
# What is left states the fabric and nothing else.
_PERIOD_PHRASES: dict[str, tuple[str, ...]] = {
    "georgian":  ("georgian", "regency"),
    "victorian": ("victorian",),
    "edwardian": ("edwardian",),
    "interwar":  ("1920s", "1930s", "inter-war", "interwar", "art deco",
                  "mock tudor"),
    "postwar":   ("1950s", "1960s", "1970s", "post-war", "postwar",
                  "mid-century"),
    "modern":    ("1980s", "1990s", "2000s"),
    "new_build": ("new build", "new-build", "newbuild", "newly built",
                  "newly constructed", "off-plan", "off plan"),
}

_PERIOD_WORDS = "|".join(
    re.escape(phrase)
    for phrases in _PERIOD_PHRASES.values()
    for phrase in phrases
)

# A street, a landmark or a pastiche is not a statement about the building.
# These are the collocations that actually appear in London listings and would
# otherwise make a 1960s block "Victorian" because it faces Victoria Park, or
# make a new development "Edwardian" because of the cornicing it copies.
_PERIOD_FALSE_FRIENDS = re.compile(
    rf"\b(?:{_PERIOD_WORDS})[\s-]+"
    r"(?:park|road|rd|street|st|avenue|lane|line|station|school|schoolhouse|"
    r"pub|square|gardens|market|arcade|parade|cinema|hall|era|times|london|"
    r"style|styled|inspired|replica|pastiche)\b",
    re.IGNORECASE,
)


def _searchable(listing: dict) -> str:
    """Key features carry the agent's own headline claims and are far less
    noisy than the description, so they are searched first and the description
    only as backup."""
    features = " . ".join(listing.get("key_features") or [])
    return f"{features} . {listing.get('listing_text') or ''}"


def period_from_listing(listing: dict) -> str | None:
    """The period this listing positively states, or None when it says nothing.

    Two periods in one description is not a tie to be broken — it is a genuine
    ambiguity ("a Georgian townhouse, converted in the 1990s" is Georgian; "a
    Victorian building, now brand new apartments" is arguable), and guessing
    between them is exactly the imputation this codebase refuses everywhere
    else. So an ambiguous listing reads as unstated here and is left to the
    model pass, which can see which claim is about the fabric.
    """
    if (listing.get("channel") or "").upper() == "NEW_HOME":
        return "new_build"

    haystack = _searchable(listing).lower()
    if not haystack.strip(" ."):
        return None

    cleaned = _PERIOD_FALSE_FRIENDS.sub(" ", haystack)

    found = [
        key for key, phrases in _PERIOD_PHRASES.items()
        if any(re.search(rf"(?<![\w-]){re.escape(p)}(?![\w-])", cleaned) for p in phrases)
    ]
    return found[0] if len(found) == 1 else None


# ── Built form ─────────────────────────────────────────────────────────────
# What Rightmove calls propertySubType, reduced to the handful of choices a
# buyer actually makes. The raw subtype has dozens of values ("Link Detached
# House", "End of Terrace") that are the same decision to almost everyone.
BUILT_FORMS: tuple[tuple[str, str], ...] = (
    ("flat",          "Flat or apartment"),
    ("maisonette",    "Maisonette"),
    ("terraced",      "Terraced house"),
    ("semi_detached", "Semi-detached house"),
    ("detached",      "Detached house"),
    ("bungalow",      "Bungalow"),
)
BUILT_FORM_KEYS = tuple(key for key, _ in BUILT_FORMS)
BUILT_FORM_LABELS = dict(BUILT_FORMS)

# Order matters: the first match wins, so the more specific subtypes are listed
# before the words they contain. "Semi-Detached" must be tested before
# "detached", and "End of Terrace Bungalow" is a bungalow first.
_BUILT_FORM_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bungalow",      ("bungalow",)),
    ("maisonette",    ("maisonette",)),
    ("flat",          ("flat", "apartment", "studio", "penthouse", "duplex")),
    ("semi_detached", ("semi-detached", "semi detached")),
    ("detached",      ("detached",)),
    ("terraced",      ("terrace", "terraced", "town house", "townhouse",
                       "mews", "cottage")),
)


def built_form_from_listing(listing: dict) -> str | None:
    """Rightmove's property sub-type mapped onto a buyer's vocabulary, or None
    when the agent left it blank or used a label that maps to nothing (a plot
    of land, a park home)."""
    raw = (listing.get("property_type") or "").strip().lower()
    if not raw:
        return None
    for key, needles in _BUILT_FORM_PATTERNS:
        if any(n in raw for n in needles):
            return key
    return None
