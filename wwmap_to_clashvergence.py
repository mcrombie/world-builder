"""
Converts a world-builder map file to a Clashvergence map definition JSON.

Usage:
    python wwmap_to_clashvergence.py path/to/map.azmap [output.json] [num_factions]
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from wwmap_core import load_map_graph

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


def translate(wwmap_path: str | Path, num_factions: int = 4) -> dict:
    """
    Reads a world-builder map file and returns a Clashvergence map definition dict.
    """
    graph = load_map_graph(wwmap_path, num_factions)

    # Faction assignment
    faction_names = graph.explicit_factions
    faction_to_id = graph.faction_to_id
    auto_start_owners: dict[str, str] = {}
    if not faction_names:
        for i, rid in enumerate(graph.auto_start_regions):
            auto_start_owners[rid] = f"Faction{i + 1}"

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
            "climate": meta.get("climate") or "temperate",
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
    return {
        "description": f"world-builder map: {graph.name}",
        "num_factions": num_factions_out,
        "faction_names": faction_names,
        "sea_links": sorted(sea_links),
        "river_links": sorted(river_links),
        "regions": clashvergence_regions,
    }


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
