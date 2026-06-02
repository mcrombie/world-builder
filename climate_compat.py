"""World Builder climate compatibility helpers.

World Builder historically stored broad climate names. Clashvergence now uses
canonical Koppen codes, so bridge scripts normalize at the export boundary.
"""

from __future__ import annotations


KOPPEN_CLIMATES = {
    "Af",
    "Am",
    "Aw",
    "BWh",
    "BWk",
    "BSh",
    "BSk",
    "Csa",
    "Csb",
    "Csc",
    "Cwa",
    "Cwb",
    "Cwc",
    "Cfa",
    "Cfb",
    "Cfc",
    "Dsa",
    "Dsb",
    "Dsc",
    "Dsd",
    "Dwa",
    "Dwb",
    "Dwc",
    "Dwd",
    "Dfa",
    "Dfb",
    "Dfc",
    "Dfd",
    "ET",
    "EF",
}

CLIMATE_ALIASES = {
    "temperate": "Cfb",
    "oceanic": "Cfb",
    "cold": "Dfb",
    "continental": "Dfb",
    "arid": "BWh",
    "desert": "BWh",
    "steppe": "BSk",
    "tropical": "Aw",
    "savanna": "Aw",
    "rainforest": "Af",
    "monsoon": "Am",
    "mediterranean": "Csa",
    "subtropical": "Cfa",
    "subarctic": "Dfc",
    "tundra": "ET",
    "polar": "ET",
    "ice": "EF",
}

NORMALIZED_KOPPEN_CODES = {
    code.lower(): code
    for code in KOPPEN_CLIMATES
}


def normalize_climate(climate: object | None, default: str = "Cfb") -> str:
    if climate is None:
        return default
    raw = str(climate).strip()
    if not raw:
        return default
    lowered = raw.lower()
    if lowered in CLIMATE_ALIASES:
        return CLIMATE_ALIASES[lowered]
    if lowered in NORMALIZED_KOPPEN_CODES:
        return NORMALIZED_KOPPEN_CODES[lowered]
    raise ValueError(f"Unsupported climate: {climate}")
