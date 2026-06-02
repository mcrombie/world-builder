"""
wwmap_core.py - shared map-graph parser for world-builder bridge scripts.

Parses a world-builder map JSON file (.azmap preferred; .wwmap supported) and
computes the full region graph: land adjacency, sea links, river links,
centroids, and start-region selection.
Import this module from any wwmap_to_*.py bridge script.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

HEX_NEIGHBORS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
WATER_TERRAINS = {"ocean", "lake"}


def parse_hex_key(key: str) -> tuple[int, int]:
    q, r = key.split(",")
    return int(q), int(r)


def axial_distance(aq: float, ar: float, bq: float, br: float) -> float:
    return (abs(aq - bq) + abs(aq + ar - bq - br) + abs(ar - br)) / 2


def pick_start_regions(
    region_centroids: dict[str, tuple[float, float]],
    count: int,
    region_neighbors: dict[str, set[str]] | None = None,
    sea_links: set[tuple[str, str]] | None = None,
) -> list[str]:
    """Greedy max-spread start region selection."""
    candidates = list(region_centroids.keys())
    if region_neighbors:
        mainland = [r for r in candidates if region_neighbors.get(r)]
        if len(mainland) >= count:
            candidates = mainland
        else:
            sea_connected: set[str] = set()
            if sea_links:
                for a, b in sea_links:
                    sea_connected.add(a)
                    sea_connected.add(b)
            reachable = [r for r in candidates if region_neighbors.get(r) or r in sea_connected]
            if len(reachable) >= count:
                candidates = reachable
    if not candidates:
        return []
    if len(candidates) <= count:
        return candidates

    seed = min(candidates, key=lambda r: region_centroids[r][0] + region_centroids[r][1])
    chosen = [seed]
    while len(chosen) < count:
        best, best_min_dist = None, -1.0
        for cand in candidates:
            if cand in chosen:
                continue
            cq, cr = region_centroids[cand]
            min_dist = min(axial_distance(cq, cr, *region_centroids[c]) for c in chosen)
            if min_dist > best_min_dist:
                best_min_dist = min_dist
                best = cand
        if best is None:
            break
        chosen.append(best)
    return chosen


@dataclass
class RegionInfo:
    name: str
    hexes: list[dict]
    land_neighbors: set[str] = field(default_factory=set)
    sea_neighbors: set[str] = field(default_factory=set)
    river_neighbors: set[str] = field(default_factory=set)
    has_interior_river: bool = False
    centroid_q: float = 0.0
    centroid_r: float = 0.0
    meta: dict = field(default_factory=dict)
    terrain_counts: Counter = field(default_factory=Counter)
    climate_counts: Counter = field(default_factory=Counter)

    @property
    def primary_terrain(self) -> str:
        if not self.terrain_counts:
            return "plains"
        return self.terrain_counts.most_common(1)[0][0]

    @property
    def dominant_climate(self) -> str | None:
        if not self.climate_counts:
            return None
        return self.climate_counts.most_common(1)[0][0]


@dataclass
class MapGraph:
    name: str
    regions: dict[str, RegionInfo]
    explicit_factions: list[str]        # faction names from .wwmap region metadata
    faction_to_id: dict[str, str]       # faction_name → "Faction1" etc.
    auto_start_regions: list[str]       # picked when no explicit factions assigned


def load_map_graph(path: str | Path, num_factions: int = 4) -> MapGraph:
    """Parse a world-builder map file into a fully-computed MapGraph."""
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8"))

    raw_hexes: dict[str, dict] = data.get("hexes", {})
    regions_meta: dict[str, dict] = data.get("regions", {})
    rivers: dict[str, str] = data.get("rivers", {})

    # Group hexes by region
    region_hexes: dict[str, list[dict]] = defaultdict(list)
    hex_to_region: dict[tuple[int, int], str] = {}
    ocean_coords: set[tuple[int, int]] = set()

    for key, hex_data in raw_hexes.items():
        q, r = parse_hex_key(key)
        terrain = hex_data.get("terrain", "plains")
        region = hex_data.get("region")
        if terrain in WATER_TERRAINS:
            ocean_coords.add((q, r))
        if region:
            region_hexes[region].append(hex_data)
            hex_to_region[(q, r)] = region

    terrain_counts_map: dict[str, Counter] = {
        rid: Counter(h.get("terrain", "plains") for h in hlist)
        for rid, hlist in region_hexes.items()
    }

    climate_counts_map: dict[str, Counter] = {
        rid: Counter(h["climate"] for h in hlist if h.get("climate"))
        for rid, hlist in region_hexes.items()
    }

    # River edges → cross-region river links
    river_links_set: set[tuple[str, str]] = set()
    regions_with_interior_rivers: set[str] = set()
    for edge_key in rivers:
        parts = edge_key.split("|")
        if len(parts) != 2:
            continue
        coord_a = parse_hex_key(parts[0])
        coord_b = parse_hex_key(parts[1])
        region_a = hex_to_region.get(coord_a)
        region_b = hex_to_region.get(coord_b)
        if region_a and region_b:
            if region_a != region_b:
                river_links_set.add(tuple(sorted([region_a, region_b])))  # type: ignore[arg-type]
            else:
                regions_with_interior_rivers.add(region_a)

    # Region land adjacency from hex neighbors
    region_neighbors: dict[str, set[str]] = defaultdict(set)
    for (q, r), region_id in hex_to_region.items():
        for dq, dr in HEX_NEIGHBORS:
            nb_region = hex_to_region.get((q + dq, r + dr))
            if nb_region and nb_region != region_id:
                region_neighbors[region_id].add(nb_region)

    # Sea links via BFS through ocean
    coast_tag_regions: set[str] = {
        rid for rid, hlist in region_hexes.items()
        if any(h.get("terrain") in {"coast", "lake", "mediterranean"} for h in hlist)
    }
    sea_links_set: set[tuple[str, str]] = set()
    if ocean_coords:
        remaining = set(ocean_coords)
        while remaining:
            start = next(iter(remaining))
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

    # Per-region neighbor sets
    sea_neighbors_map: dict[str, set[str]] = defaultdict(set)
    for ra, rb in sea_links_set:
        sea_neighbors_map[ra].add(rb)
        sea_neighbors_map[rb].add(ra)

    river_neighbors_map: dict[str, set[str]] = defaultdict(set)
    for ra, rb in river_links_set:
        river_neighbors_map[ra].add(rb)
        river_neighbors_map[rb].add(ra)

    # Region centroids
    region_centroids: dict[str, tuple[float, float]] = {}
    for rid, hlist in region_hexes.items():
        region_centroids[rid] = (
            sum(h["q"] for h in hlist) / len(hlist),
            sum(h["r"] for h in hlist) / len(hlist),
        )

    # Faction assignments from metadata
    faction_names: list[str] = []
    for rid in region_hexes:
        meta = regions_meta.get(rid, {})
        faction = meta.get("faction")
        if faction and faction not in faction_names:
            faction_names.append(faction)
    faction_to_id = {f: f"Faction{i + 1}" for i, f in enumerate(sorted(faction_names))}

    auto_start_regions: list[str] = []
    if not faction_names:
        auto_start_regions = pick_start_regions(
            region_centroids, num_factions,
            region_neighbors=region_neighbors,
            sea_links=sea_links_set,
        )

    # Build RegionInfo objects
    regions: dict[str, RegionInfo] = {}
    for rid, hlist in region_hexes.items():
        cq, cr = region_centroids[rid]
        regions[rid] = RegionInfo(
            name=rid,
            hexes=hlist,
            land_neighbors=set(region_neighbors[rid]),
            sea_neighbors=set(sea_neighbors_map[rid]),
            river_neighbors=set(river_neighbors_map[rid]),
            has_interior_river=rid in regions_with_interior_rivers,
            centroid_q=cq,
            centroid_r=cr,
            meta=regions_meta.get(rid, {}),
            terrain_counts=terrain_counts_map[rid],
            climate_counts=climate_counts_map[rid],
        )

    return MapGraph(
        name=data.get("name", path.stem),
        regions=regions,
        explicit_factions=faction_names,
        faction_to_id=faction_to_id,
        auto_start_regions=auto_start_regions,
    )
