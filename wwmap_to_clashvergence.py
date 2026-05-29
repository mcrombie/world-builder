"""
Converts a Worldwright .wwmap file to a Clashvergence map definition JSON.

Usage:
    python wwmap_to_clashvergence.py path/to/map.wwmap [output.json]

If output path is omitted, writes to the same directory as the input with
a .cmap.json extension.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

# ── Terrain mapping ──────────────────────────────────────────────────────────
# Worldwright terrain type → Clashvergence terrain_tags list.
# ocean is excluded: those hexes form water bodies, not regions.

TERRAIN_TO_TAGS: dict[str, list[str]] = {
    "ocean":                 [],           # not a playable region
    "coast":                 ["coast"],
    "grassland":             ["plains"],
    "plains":                ["steppe"],
    "hills":                 ["hills"],
    "tundra_hills":          ["hills"],
    "desert_hills":          ["hills"],
    "forest":                ["forest"],
    "deep_forest":           ["forest", "highland"],
    "mountain":              ["highland"],
    "tundra_mountain":       ["highland"],
    "desert_mountain":       ["highland"],
    "high_mountain":         ["highland"],
    "tundra_high_mountain":  ["highland"],
    "desert_high_mountain":  ["highland"],
    "desert":                ["steppe"],
    "tundra":                ["plains"],
    "wetland":               ["marsh"],
    "lake":                  ["coast"],    # inland water body treated as coast
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

HEX_NEIGHBORS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]

WATER_TERRAINS = {"ocean", "lake"}


def _parse_hex_key(key: str) -> tuple[int, int]:
    q, r = key.split(",")
    return int(q), int(r)


def _sorted_terrain_tags(tags: list[str]) -> list[str]:
    unique = list(dict.fromkeys(tags))  # deduplicate, preserve order
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


def _axial_distance(aq: float, ar: float, bq: float, br: float) -> float:
    """Hex axial distance (works on fractional centroids too)."""
    return (abs(aq - bq) + abs(aq + ar - bq - br) + abs(ar - br)) / 2


def _pick_start_regions(
    region_centroids: dict[str, tuple[float, float]],
    count: int,
) -> list[str]:
    """
    Greedily pick `count` regions that maximise minimum pairwise hex distance.
    Skips ocean-only regions (no centroid entry).
    """
    candidates = list(region_centroids.keys())
    if not candidates:
        return []
    if len(candidates) <= count:
        return candidates

    # Seed with the region closest to the geographic extremes (top-left ish)
    seed = min(candidates, key=lambda r: region_centroids[r][0] + region_centroids[r][1])
    chosen = [seed]

    while len(chosen) < count:
        best, best_min_dist = None, -1.0
        for cand in candidates:
            if cand in chosen:
                continue
            cq, cr = region_centroids[cand]
            min_dist = min(
                _axial_distance(cq, cr, *region_centroids[c]) for c in chosen
            )
            if min_dist > best_min_dist:
                best_min_dist = min_dist
                best = cand
        if best is None:
            break
        chosen.append(best)

    return chosen


def translate(wwmap_path: str | Path) -> dict:
    """
    Reads a .wwmap file and returns a Clashvergence map definition dict with:
        {
            "description": str,
            "regions": { name: { neighbors, owner, resources, terrain_tags, climate } },
            "sea_links": [[a, b], ...],
            "river_links": [[a, b], ...],
        }
    """
    path = Path(wwmap_path)
    data = json.loads(path.read_text(encoding="utf-8"))

    hexes: dict[str, dict] = data.get("hexes", {})
    regions_meta: dict[str, dict] = data.get("regions", {})
    rivers: dict[str, str] = data.get("rivers", {})  # edgeKey → RiverSize

    # ── 1. Group hexes by region ──────────────────────────────────────────────
    region_hexes: dict[str, list[dict]] = defaultdict(list)
    hex_to_region: dict[tuple[int, int], str] = {}
    ocean_coords: set[tuple[int, int]] = set()
    water_coords: set[tuple[int, int]] = set()  # ocean + lake

    for key, hex_data in hexes.items():
        q, r = _parse_hex_key(key)
        terrain = hex_data.get("terrain", "plains")
        region = hex_data.get("region")

        if terrain in WATER_TERRAINS:
            water_coords.add((q, r))
        if terrain == "ocean":
            ocean_coords.add((q, r))

        if region:
            region_hexes[region].append(hex_data)
            hex_to_region[(q, r)] = region

    # ── 2. Per-region terrain tags ───────────────────────────────────────────
    def compute_terrain_tags(region_id: str) -> list[str]:
        terrain_counts: Counter = Counter(
            h.get("terrain", "plains") for h in region_hexes[region_id]
        )
        tags: list[str] = []
        for terrain, _count in terrain_counts.most_common():
            mapped = TERRAIN_TO_TAGS.get(terrain, ["plains"])
            for t in mapped:
                if t not in tags:
                    tags.append(t)
        return _sorted_terrain_tags(tags) or ["plains"]

    # ── 3. River edges → cross-region river links ────────────────────────────
    river_links_set: set[tuple[str, str]] = set()
    regions_with_interior_rivers: set[str] = set()

    for edge_key in rivers:
        # edge_key format: "q1,r1|q2,r2"
        parts = edge_key.split("|")
        if len(parts) != 2:
            continue
        coord_a = _parse_hex_key(parts[0])
        coord_b = _parse_hex_key(parts[1])
        region_a = hex_to_region.get(coord_a)
        region_b = hex_to_region.get(coord_b)
        if region_a and region_b:
            if region_a != region_b:
                river_links_set.add(tuple(sorted([region_a, region_b])))  # type: ignore[arg-type]
            else:
                regions_with_interior_rivers.add(region_a)

    # ── 4. Region adjacency from hex neighbors ───────────────────────────────
    region_neighbors: dict[str, set[str]] = defaultdict(set)

    for (q, r), region_id in hex_to_region.items():
        for dq, dr in HEX_NEIGHBORS:
            neighbor_region = hex_to_region.get((q + dq, r + dr))
            if neighbor_region and neighbor_region != region_id:
                region_neighbors[region_id].add(neighbor_region)

    # ── 5. Sea links via BFS through ocean ───────────────────────────────────
    coast_tag_regions: set[str] = {
        rid
        for rid, hlist in region_hexes.items()
        if any(h.get("terrain") in {"coast", "lake", "mediterranean"} for h in hlist)
    }

    sea_links_set: set[tuple[str, str]] = set()

    if ocean_coords:
        remaining = set(ocean_coords)
        while remaining:
            start = next(iter(remaining))
            # BFS through ocean
            queue = [start]
            visited: set[tuple[int, int]] = {start}
            reachable: set[str] = set()
            while queue:
                oq, or_ = queue.pop(0)
                for dq, dr in HEX_NEIGHBORS:
                    nb = (oq + dq, or_ + dr)
                    if nb in ocean_coords and nb not in visited:
                        visited.add(nb)
                        queue.append(nb)
                    elif nb in hex_to_region:
                        rid = hex_to_region[nb]
                        if rid in coast_tag_regions:
                            reachable.add(rid)
            remaining -= visited
            reachable_list = sorted(reachable)
            for i, ra in enumerate(reachable_list):
                for rb in reachable_list[i + 1:]:
                    sea_links_set.add((ra, rb))

    # ── 6. Compute region centroids (average hex coord) ──────────────────────
    region_centroids: dict[str, tuple[float, float]] = {}
    for region_id, hex_list in region_hexes.items():
        qs = [h["q"] for h in hex_list]
        rs = [h["r"] for h in hex_list]
        region_centroids[region_id] = (sum(qs) / len(qs), sum(rs) / len(rs))

    # ── 7. Build final region map ─────────────────────────────────────────────
    # Collect unique faction names and map to "FactionN" internal IDs
    faction_names: list[str] = []
    for rid in region_hexes:
        meta = regions_meta.get(rid, {})
        faction = meta.get("faction")
        if faction and faction not in faction_names:
            faction_names.append(faction)
    faction_to_id = {f: f"Faction{i + 1}" for i, f in enumerate(sorted(faction_names))}

    # If no factions are assigned, auto-place 4 starting regions
    DEFAULT_FACTIONS = 4
    auto_start_owners: dict[str, str] = {}
    if not faction_names:
        start_regions = _pick_start_regions(region_centroids, DEFAULT_FACTIONS)
        for i, rid in enumerate(start_regions):
            auto_start_owners[rid] = f"Faction{i + 1}"

    clashvergence_regions: dict[str, dict] = {}
    for region_id in region_hexes:
        meta = regions_meta.get(region_id, {})
        tags = compute_terrain_tags(region_id)

        # Interior rivers add riverland tag
        if region_id in regions_with_interior_rivers and "riverland" not in tags:
            tags = _sorted_terrain_tags(["riverland"] + tags)

        faction = meta.get("faction")
        owner = faction_to_id.get(faction) if faction else auto_start_owners.get(region_id)

        clashvergence_regions[region_id] = {
            "neighbors": sorted(region_neighbors[region_id]),
            "owner": owner,
            "resources": _resources_for_tags(tags),
            "terrain_tags": tags,
            "climate": meta.get("climate") or "temperate",
        }

    # Ensure river links only reference known regions; also add riverland-riverland links
    river_links: list[list[str]] = []
    for ra, rb in river_links_set:
        if ra in clashvergence_regions and rb in clashvergence_regions:
            river_links.append(sorted([ra, rb]))

    for region_id, region_data in clashvergence_regions.items():
        if "riverland" in region_data["terrain_tags"]:
            for nb in region_data["neighbors"]:
                if "riverland" in clashvergence_regions.get(nb, {}).get("terrain_tags", []):
                    link = sorted([region_id, nb])
                    if link not in river_links:
                        river_links.append(link)

    # Deduplicate river links
    river_links = [list(x) for x in {tuple(link) for link in river_links}]

    num_factions = len(faction_names) if faction_names else DEFAULT_FACTIONS
    map_def = {
        "description": f"Worldwright map: {data.get('name', path.stem)}",
        "num_factions": num_factions,
        "faction_names": faction_names,
        "sea_links": [sorted(list(link)) for link in sea_links_set],
        "river_links": sorted(river_links),
        "regions": clashvergence_regions,
    }

    return map_def


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else input_path.with_suffix(".cmap.json")
    )

    print(f"Translating: {input_path}")
    map_def = translate(input_path)
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
