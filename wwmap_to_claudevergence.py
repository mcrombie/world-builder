"""
Converts a world-builder map file to a Claudevergence map definition JSON.

Usage:
    python wwmap_to_claudevergence.py path/to/map.azmap [output.json] [num_traditions]

Claudevergence is a cultural diffusion simulation. Traditions spread influence
across regions through contact, prestige, and terrain affinity rather than
military conquest. The output .cvmap.json preserves sea links, river links,
and terrain data that drives the cultural spread mechanics.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from wwmap_core import load_map_graph

# Terrain → base prestige value for Claudevergence (richness of a region as
# a cultural anchor point). Higher prestige = stronger radiation source.
TERRAIN_PRESTIGE: dict[str, int] = {
    "riverland":  3,
    "coast":      3,
    "plains":     2,
    "grassland":  2,
    "mediterranean": 3,
    "forest":     2,
    "hills":      2,
    "highland":   1,
    "steppe":     2,
    "desert":     1,
    "tundra":     1,
    "wetland":    1,
    "marsh":      1,
}

# Terrain → canonical Claudevergence terrain tag (simplified vs. Clashvergence)
TERRAIN_TAG: dict[str, str] = {
    "ocean":                "ocean",
    "coast":                "coast",
    "grassland":            "plains",
    "plains":               "steppe",
    "hills":                "hills",
    "tundra_hills":         "hills",
    "desert_hills":         "hills",
    "forest":               "forest",
    "deep_forest":          "forest",
    "mountain":             "highland",
    "tundra_mountain":      "highland",
    "desert_mountain":      "highland",
    "high_mountain":        "highland",
    "tundra_high_mountain": "highland",
    "desert_high_mountain": "highland",
    "desert":               "steppe",
    "tundra":               "plains",
    "wetland":              "marsh",
    "lake":                 "coast",
    "highland":             "highland",
    "riverland":            "riverland",
    "mediterranean":        "coast",
}


def _base_prestige(terrain_counts) -> int:
    """Average prestige value across hex terrains in a region."""
    total = 0
    count = 0
    for terrain, n in terrain_counts.items():
        tag = TERRAIN_TAG.get(terrain, "plains")
        total += TERRAIN_PRESTIGE.get(tag, 2) * n
        count += n
    if count == 0:
        return 2
    return max(1, min(4, round(total / count)))


def _terrain_tags(terrain_counts) -> list[str]:
    """Derive unique canonical terrain tags for a region, most-common first."""
    seen: list[str] = []
    for terrain, _ in terrain_counts.most_common():
        tag = TERRAIN_TAG.get(terrain, "plains")
        if tag not in seen and tag != "ocean":
            seen.append(tag)
    return seen or ["plains"]


_MIN_CONNECTIVITY = 3   # min total connections (land+sea+river) for a viable start


def _region_connectivity(region) -> int:
    return len(region.land_neighbors) + len(region.sea_neighbors) + len(region.river_neighbors)


def _pick_connected_starts(graph, num_traditions: int) -> list[str]:
    """
    Geometric spread start selection that filters out isolated peninsulas.
    A region with only 1-2 total connections is a dead-end — its tradition
    can never meaningfully expand.
    """
    from wwmap_core import pick_start_regions

    well_connected = {
        rid: (region.centroid_q, region.centroid_r)
        for rid, region in graph.regions.items()
        if _region_connectivity(region) >= _MIN_CONNECTIVITY
    }
    if len(well_connected) < num_traditions:
        well_connected = {
            rid: (region.centroid_q, region.centroid_r)
            for rid, region in graph.regions.items()
        }

    sea_links: set[tuple[str, str]] = set()
    for rid, region in graph.regions.items():
        for nb in region.sea_neighbors:
            sea_links.add(tuple(sorted([rid, nb])))  # type: ignore[arg-type]

    region_neighbors = {rid: region.land_neighbors for rid, region in graph.regions.items()}

    return pick_start_regions(
        well_connected, num_traditions,
        region_neighbors=region_neighbors,
        sea_links=sea_links,
    )


def translate(wwmap_path: str | Path, num_traditions: int = 4) -> dict:
    """
    Reads a world-builder map file and returns a Claudevergence map definition dict.
    """
    graph = load_map_graph(wwmap_path, num_traditions)

    # Starting tradition assignments
    faction_names = graph.explicit_factions
    faction_to_id = graph.faction_to_id

    region_starting_tradition: dict[str, str | None] = {}
    if faction_names:
        for rid, region in graph.regions.items():
            faction = region.meta.get("faction")
            region_starting_tradition[rid] = faction_to_id.get(faction) if faction else None
        num_traditions_out = len(faction_names)
    else:
        connected_starts = _pick_connected_starts(graph, num_traditions)
        auto_starts = {r: f"Tradition{i + 1}" for i, r in enumerate(connected_starts)}
        for rid in graph.regions:
            region_starting_tradition[rid] = auto_starts.get(rid)
        num_traditions_out = num_traditions

    # Build Claudevergence region objects
    cv_regions: dict[str, dict] = {}
    for rid, region in graph.regions.items():
        tags = _terrain_tags(region.terrain_counts)
        cv_regions[rid] = {
            "neighbors":       sorted(region.land_neighbors),
            "sea_neighbors":   sorted(region.sea_neighbors),
            "river_neighbors": sorted(region.river_neighbors),
            "terrain_tags":    tags,
            "climate":         region.meta.get("climate") or "temperate",
            "base_prestige":   _base_prestige(region.terrain_counts),
            "starting_tradition": region_starting_tradition.get(rid),
        }

    sea_links: list[list[str]] = sorted({
        tuple(sorted([rid, nb]))  # type: ignore[arg-type]
        for rid, region in graph.regions.items()
        for nb in region.sea_neighbors
        if nb in graph.regions
    })

    river_links: list[list[str]] = sorted({
        tuple(sorted([rid, nb]))  # type: ignore[arg-type]
        for rid, region in graph.regions.items()
        for nb in region.river_neighbors
        if nb in graph.regions
    })

    return {
        "description": f"world-builder map: {graph.name}",
        "num_traditions": num_traditions_out,
        "tradition_names": faction_names,
        "sea_links":    [list(lnk) for lnk in sea_links],
        "river_links":  [list(lnk) for lnk in river_links],
        "regions": cv_regions,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = (
        Path(sys.argv[2]) if len(sys.argv) > 2
        else input_path.with_suffix(".cvmap.json")
    )
    num_traditions = int(sys.argv[3]) if len(sys.argv) > 3 else 4

    print(f"Translating: {input_path}")
    map_def = translate(input_path, num_traditions=num_traditions)
    region_count = len(map_def["regions"])
    trad_count = map_def["num_traditions"]
    print(f"  {region_count} regions, {trad_count} tradition(s)")
    print(f"  {len(map_def['sea_links'])} sea links, {len(map_def['river_links'])} river links")

    output_path.write_text(
        json.dumps(map_def, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Written: {output_path}")


if __name__ == "__main__":
    main()
