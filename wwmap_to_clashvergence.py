"""
Converts a world-builder map file to a Clashvergence map definition JSON.

Usage:
    python wwmap_to_clashvergence.py path/to/map.azmap [output.json] [num_factions]
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from wwmap_core import load_map_graph

try:
    from azhoran_language_profiles import (
        DEFAULT_AZHORAN_LANGUAGE_ORDER,
        get_azhoran_language_profile,
    )
except ImportError:  # pragma: no cover - keeps non-Azhora bridge use lightweight.
    DEFAULT_AZHORAN_LANGUAGE_ORDER = []

    def get_azhoran_language_profile(language_key: str) -> dict | None:
        return None

# ── Terrain mapping ──────────────────────────────────────────────────────────
# world-builder terrain type → Clashvergence terrain_tags list.
# ocean is excluded: those hexes form water bodies, not regions.

TERRAIN_TO_TAGS: dict[str, list[str]] = {
    "ocean":                 [],
    "coast":                 ["coast"],
    "grassland":             ["plains"],
    "plains":                ["steppe"],
    "hills":                 ["hills"],
    "tundra_hills":          ["hills"],
    "desert_hills":          ["hills"],
    "forest":                ["forest"],
    "deep_forest":           ["forest", "highland"],
    "jungle":                ["forest"],
    "deep_jungle":           ["forest", "highland"],
    "mountain":              ["highland"],
    "tundra_mountain":       ["highland"],
    "desert_mountain":       ["highland"],
    "high_mountain":         ["highland"],
    "tundra_high_mountain":  ["highland"],
    "desert_high_mountain":  ["highland"],
    "desert":                ["steppe"],
    "tundra":                ["plains"],
    "wetland":               ["marsh"],
    "lake":                  ["coast"],
    "highland":              ["highland"],
    "riverland":             ["riverland"],
    "mediterranean":         ["coast", "plains"],
}

TERRAIN_DISPLAY_ORDER = [
    "coast", "riverland", "highland", "hills", "marsh", "forest", "steppe", "plains",
]

TERRAIN_ECONOMIC_MODIFIER: dict[str, int] = {
    "riverland": 1,
    "coast":     1,
    "marsh":    -1,
    "plains":    0,
    "steppe":    0,
    "forest":    0,
    "hills":     0,
    "highland":  0,
}

AZHORAN_PREFERRED_START_REGIONS: dict[str, list[str]] = {
    "boueni": ["Central Lond"],
    "mittoli": ["East Mithala"],
    "pyrosi": ["West Pyros", "East Pyros"],
    "moreshi": ["Marosh"],
    "grassic": ["West Mithala"],
    "ibnael": ["South Acordwood"],
    "elodi": ["East Suval"],
    "elagosi": ["Elagos"],
    "kellith": ["Telemonia"],
}

AZHORAN_DISRUPTIVE_ARRIVALS: dict[str, dict] = {
    "mittoli": {
        "arrival_turn": 10,
        "arrival_type": "disruptive_colonial_landing",
        "entry_region": "East Mithala",
        "origin": "foreign land",
        "status": "foreign_colony",
    },
    "ibnael": {
        "arrival_turn": 11,
        "arrival_type": "disruptive_colonial_landing",
        "entry_region": "South Acordwood",
        "origin": "foreign land",
        "status": "foreign_colony",
    },
    "elodi": {
        "arrival_turn": 20,
        "arrival_type": "disruptive_colonial_landing",
        "entry_region": "East Suval",
        "origin": "foreign land",
        "status": "foreign_colony",
    },
}


def _sorted_terrain_tags(tags: list[str]) -> list[str]:
    unique = list(dict.fromkeys(tags))
    return sorted(
        unique,
        key=lambda t: (
            TERRAIN_DISPLAY_ORDER.index(t) if t in TERRAIN_DISPLAY_ORDER else len(TERRAIN_DISPLAY_ORDER),
            t,
        ),
    )


def _resources_for_tags(tags: list[str]) -> int:
    mod = sum(TERRAIN_ECONOMIC_MODIFIER.get(t, 0) for t in tags)
    return max(1, min(4, 2 + mod))


def _compute_terrain_tags(terrain_counts: Counter) -> list[str]:
    tags: list[str] = []
    for terrain, _count in terrain_counts.most_common():
        for t in TERRAIN_TO_TAGS.get(terrain, ["plains"]):
            if t not in tags:
                tags.append(t)
    return _sorted_terrain_tags(tags) or ["plains"]


def _load_azhoran_scenario(wwmap_path: Path) -> dict | None:
    scenario_paths = [
        wwmap_path.with_name(f"{wwmap_path.stem}_scenario.json"),
        wwmap_path.with_name("azhoran_scenario.json"),
        wwmap_path.with_name("azhora_scenario.json"),
    ]
    for scenario_path in scenario_paths:
        if scenario_path.exists():
            return json.loads(scenario_path.read_text(encoding="utf-8"))
    return None


def _extract_language_key(entry: dict) -> str | None:
    for field in ("language", "language_key", "language_family", "family", "family_name"):
        value = entry.get(field)
        if value:
            return str(value).strip().lower()
    return None


def _is_configured_faction_id(value: str, num_factions: int) -> bool:
    match = re.fullmatch(r"Faction([1-9][0-9]*)", value)
    return bool(match and int(match.group(1)) <= num_factions)


def _resolve_language_owner_id(
    entry: dict,
    assignment_index: int,
    graph,
    num_factions: int,
) -> str | None:
    for field in ("id", "internal_id", "owner", "faction_id"):
        value = entry.get(field)
        if value and _is_configured_faction_id(str(value), num_factions):
            return str(value)

    for field in ("faction", "name", "faction_name"):
        value = entry.get(field)
        if value in graph.faction_to_id:
            return graph.faction_to_id[value]

    index_value = entry.get("index")
    if isinstance(index_value, int) and 1 <= index_value <= num_factions:
        return f"Faction{index_value}"

    if 1 <= assignment_index <= num_factions:
        return f"Faction{assignment_index}"
    return None


def _is_azhora_map(wwmap_path: Path, graph) -> bool:
    return "azhora" in graph.name.lower() or "azhora" in wwmap_path.stem.lower()


def _get_default_language_faction_id(language_key: str, num_factions: int) -> str | None:
    normalized_language_key = language_key.strip().lower()
    for index, default_language_key in enumerate(DEFAULT_AZHORAN_LANGUAGE_ORDER[:num_factions], start=1):
        if default_language_key == normalized_language_key:
            return f"Faction{index}"
    return None


def _apply_azhoran_start_preferences(
    wwmap_path: Path,
    graph,
    auto_start_owners: dict[str, str],
    num_factions: int,
) -> None:
    if not _is_azhora_map(wwmap_path, graph):
        return

    for language_key, preferred_regions in AZHORAN_PREFERRED_START_REGIONS.items():
        owner_id = _get_default_language_faction_id(language_key, num_factions)
        if owner_id is None:
            continue

        preferred_region = next(
            (region_name for region_name in preferred_regions if region_name in graph.regions),
            None,
        )
        if preferred_region is None:
            continue

        current_region = next(
            (
                region_name
                for region_name, current_owner_id in auto_start_owners.items()
                if current_owner_id == owner_id
            ),
            None,
        )
        displaced_owner_id = auto_start_owners.get(preferred_region)
        if current_region is not None:
            auto_start_owners.pop(current_region, None)
        if (
            current_region is not None
            and displaced_owner_id is not None
            and displaced_owner_id != owner_id
        ):
            auto_start_owners[current_region] = displaced_owner_id
        auto_start_owners[preferred_region] = owner_id


def _build_azhoran_faction_arrivals(
    wwmap_path: Path,
    graph,
    num_factions: int,
) -> dict[str, dict]:
    if not _is_azhora_map(wwmap_path, graph):
        return {}

    arrivals: dict[str, dict] = {}
    for language_key, arrival in AZHORAN_DISRUPTIVE_ARRIVALS.items():
        owner_id = _get_default_language_faction_id(language_key, num_factions)
        if owner_id is None:
            continue
        entry_region = arrival.get("entry_region")
        if entry_region not in graph.regions:
            continue
        arrivals[owner_id] = {
            "language": language_key,
            **arrival,
        }
    return arrivals


def _remove_delayed_azhoran_start_owners(
    auto_start_owners: dict[str, str],
    faction_arrivals: dict[str, dict],
) -> None:
    delayed_owner_ids = set(faction_arrivals)
    for region_name, owner_id in list(auto_start_owners.items()):
        if owner_id in delayed_owner_ids:
            auto_start_owners.pop(region_name, None)


def _build_faction_language_families(
    wwmap_path: Path,
    graph,
    num_factions: int,
) -> dict[str, dict]:
    faction_language_families: dict[str, dict] = {}
    scenario = _load_azhoran_scenario(wwmap_path)
    if scenario is not None:
        entries = (
            scenario.get("factions")
            or scenario.get("faction_languages")
            or scenario.get("factionLanguageFamilies")
            or []
        )
        if isinstance(entries, dict):
            normalized_entries = []
            for owner_id, entry in entries.items():
                if isinstance(entry, dict):
                    normalized_entries.append({"id": owner_id, **entry})
                else:
                    normalized_entries.append({"id": owner_id, "language": entry})
            entries = normalized_entries
        if isinstance(entries, list):
            for assignment_index, entry in enumerate(entries, start=1):
                if not isinstance(entry, dict):
                    continue
                language_key = _extract_language_key(entry)
                if language_key is None:
                    continue
                owner_id = _resolve_language_owner_id(
                    entry,
                    assignment_index,
                    graph,
                    num_factions,
                )
                profile = get_azhoran_language_profile(language_key)
                if owner_id is not None and profile is not None:
                    faction_language_families[owner_id] = profile

    for region in graph.regions.values():
        language_key = _extract_language_key(region.meta)
        faction_name = region.meta.get("faction")
        owner_id = graph.faction_to_id.get(faction_name)
        if language_key is None or owner_id is None:
            continue
        profile = get_azhoran_language_profile(language_key)
        if profile is not None:
            faction_language_families[owner_id] = profile

    if not faction_language_families and _is_azhora_map(wwmap_path, graph):
        for index, language_key in enumerate(DEFAULT_AZHORAN_LANGUAGE_ORDER[:num_factions], start=1):
            profile = get_azhoran_language_profile(language_key)
            if profile is not None:
                faction_language_families[f"Faction{index}"] = profile

    return faction_language_families


def translate(wwmap_path: str | Path, num_factions: int = 4) -> dict:
    """
    Reads a world-builder map file and returns a Clashvergence map definition dict.
    """
    wwmap_path = Path(wwmap_path)
    graph = load_map_graph(wwmap_path, num_factions)

    # Faction assignment
    faction_names = graph.explicit_factions
    faction_to_id = graph.faction_to_id
    auto_start_owners: dict[str, str] = {}
    if not faction_names:
        for i, rid in enumerate(graph.auto_start_regions):
            auto_start_owners[rid] = f"Faction{i + 1}"
        _apply_azhoran_start_preferences(
            wwmap_path,
            graph,
            auto_start_owners,
            num_factions,
        )
    faction_arrivals = _build_azhoran_faction_arrivals(
        wwmap_path,
        graph,
        num_factions,
    )
    if faction_arrivals:
        _remove_delayed_azhoran_start_owners(auto_start_owners, faction_arrivals)

    # Build Clashvergence region objects
    clashvergence_regions: dict[str, dict] = {}
    for rid, region in graph.regions.items():
        tags = _compute_terrain_tags(region.terrain_counts)

        # Interior rivers add riverland tag
        if region.has_interior_river and "riverland" not in tags:
            tags = _sorted_terrain_tags(["riverland"] + tags)

        meta = region.meta
        faction = meta.get("faction")
        if faction:
            owner = faction_to_id.get(faction)
        else:
            owner = auto_start_owners.get(rid)

        clashvergence_regions[rid] = {
            "neighbors": sorted(region.land_neighbors),
            "owner": owner,
            "resources": _resources_for_tags(tags),
            "terrain_tags": tags,
            "climate": region.dominant_climate or meta.get("climate") or "temperate",
        }

    # River links — only between known regions; also connect adjacent riverland regions
    river_links: list[list[str]] = []
    for rid, region in graph.regions.items():
        for nb in region.river_neighbors:
            if nb in clashvergence_regions:
                link = sorted([rid, nb])
                if link not in river_links:
                    river_links.append(link)

    for rid, rdata in clashvergence_regions.items():
        if "riverland" in rdata["terrain_tags"]:
            for nb in rdata["neighbors"]:
                if "riverland" in clashvergence_regions.get(nb, {}).get("terrain_tags", []):
                    link = sorted([rid, nb])
                    if link not in river_links:
                        river_links.append(link)

    river_links = [list(x) for x in {tuple(lnk) for lnk in river_links}]

    sea_links: list[list[str]] = []
    for rid, region in graph.regions.items():
        for nb in region.sea_neighbors:
            if nb in clashvergence_regions:
                link = sorted([rid, nb])
                if link not in sea_links:
                    sea_links.append(link)
    sea_links = [list(x) for x in {tuple(lnk) for lnk in sea_links}]

    num_factions_out = len(faction_names) if faction_names else num_factions
    map_definition = {
        "description": f"world-builder map: {graph.name}",
        "num_factions": num_factions_out,
        "faction_names": faction_names,
        "sea_links": sorted(sea_links),
        "river_links": sorted(river_links),
        "regions": clashvergence_regions,
    }
    faction_language_families = _build_faction_language_families(
        wwmap_path,
        graph,
        num_factions_out,
    )
    if faction_language_families:
        map_definition["faction_language_families"] = faction_language_families
    if faction_arrivals:
        map_definition["faction_arrivals"] = faction_arrivals
    return map_definition


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = (
        Path(sys.argv[2]) if len(sys.argv) > 2
        else input_path.with_suffix(".cmap.json")
    )
    num_factions = int(sys.argv[3]) if len(sys.argv) > 3 else 4

    print(f"Translating: {input_path}")
    map_def = translate(input_path, num_factions=num_factions)
    region_count = len(map_def["regions"])
    faction_count = map_def["num_factions"]
    print(f"  {region_count} regions, {faction_count} faction(s)")
    print(f"  {len(map_def['sea_links'])} sea links, {len(map_def['river_links'])} river links")

    output_path.write_text(
        json.dumps(map_def, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Written: {output_path}")


if __name__ == "__main__":
    main()
