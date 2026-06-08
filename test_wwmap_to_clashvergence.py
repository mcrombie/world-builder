import json
import shutil
import unittest
from pathlib import Path

from wwmap_to_clashvergence import default_output_path, translate


ROOT = Path(__file__).parent


def _write_test_map(path: Path, *, regions: dict, hexes: dict) -> None:
    path.write_text(
        json.dumps(
            {
                "name": "Climate Test",
                "regions": regions,
                "rivers": {},
                "hexes": hexes,
            }
        ),
        encoding="utf-8",
    )


class ClashvergenceExportTests(unittest.TestCase):
    def test_default_output_path_uses_clean_cmap_name(self):
        self.assertEqual(default_output_path("azhora.azmap"), Path("azhora.cmap.json"))
        self.assertEqual(default_output_path("azhora.wwmap"), Path("azhora.cmap.json"))
        self.assertEqual(default_output_path("azhora.json"), Path("azhora.cmap.json"))
        self.assertEqual(default_output_path("azhora.cmap.json"), Path("azhora.cmap.json"))

    def test_azhora_export_includes_default_language_families(self):
        map_definition = translate(ROOT / "saved_maps" / "azhora.azmap", num_factions=9)
        language_families = map_definition.get("faction_language_families")

        self.assertIsNotNone(language_families)
        self.assertEqual(
            [language_families[f"Faction{index}"]["family_name"] for index in range(1, 10)],
            [
                "Boueni",
                "Mittoli",
                "Pyrosi",
                "Moreshi",
                "Grassic",
                "Ibnael",
                "Elodi",
                "Elagosi",
                "Kellith",
            ],
        )
        self.assertEqual(language_families["Faction1"]["default_culture_name"], "Boueni")
        self.assertEqual(language_families["Faction6"]["default_culture_name"], "Ibnael")
        self.assertEqual(language_families["Faction7"]["default_culture_name"], "Elodi")
        self.assertEqual(language_families["Faction8"]["default_culture_name"], "Elagosi")
        self.assertEqual(language_families["Faction9"]["default_culture_name"], "Telemon")
        self.assertIn("vel", language_families["Faction1"]["lexical_roots"]["river"])
        self.assertIn("iben", language_families["Faction6"]["lexical_roots"]["forest"])
        self.assertIn("kol", language_families["Faction7"]["lexical_roots"]["sacred"])
        self.assertIn("ela", language_families["Faction8"]["lexical_roots"]["river"])
        self.assertIn("keth", language_families["Faction9"]["lexical_roots"]["fort"])

    def test_azhora_export_starts_language_families_in_homeland_regions(self):
        map_definition = translate(ROOT / "saved_maps" / "azhora.azmap", num_factions=9)
        expected_starts = {
            "Faction1": "Central Lond",
            "Faction3": "West Pyros",
            "Faction4": "Marosh",
            "Faction5": "West Mithala",
            "Faction8": "Elagos",
            "Faction9": "Telemonia",
        }
        expected_arrivals = {
            "Faction2": (10, "East Mithala"),
            "Faction6": (11, "South Acordwood"),
            "Faction7": (20, "East Suval"),
        }

        for owner_id, region_name in expected_starts.items():
            self.assertEqual(map_definition["regions"][region_name]["owner"], owner_id)
            self.assertEqual(
                [
                    current_region_name
                    for current_region_name, region_data in map_definition["regions"].items()
                    if region_data.get("owner") == owner_id
                ],
                [region_name],
            )

        for owner_id, (arrival_turn, entry_region) in expected_arrivals.items():
            arrival = map_definition["faction_arrivals"][owner_id]
            self.assertEqual(arrival["arrival_turn"], arrival_turn)
            self.assertEqual(arrival["entry_region"], entry_region)
            self.assertEqual(arrival["arrival_type"], "disruptive_colonial_landing")
            self.assertEqual(map_definition["regions"][entry_region]["owner"], None)
            self.assertEqual(
                [
                    current_region_name
                    for current_region_name, region_data in map_definition["regions"].items()
                    if region_data.get("owner") == owner_id
                ],
                [],
            )

    def test_plain_export_omits_language_families(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "plain_map.azmap"
        map_path.write_text(
            json.dumps(
                {
                    "name": "Plain Test",
                    "regions": {
                        "North": {"name": "North", "color": "#aaaaaa"},
                        "South": {"name": "South", "color": "#bbbbbb"},
                    },
                    "rivers": {},
                    "hexes": {
                        "0,0": {"q": 0, "r": 0, "terrain": "grassland", "region": "North"},
                        "1,0": {"q": 1, "r": 0, "terrain": "grassland", "region": "South"},
                    },
                }
            ),
            encoding="utf-8",
        )
        try:
            map_definition = translate(map_path, num_factions=2)
        finally:
            shutil.rmtree(tmp_dir)

        self.assertNotIn("faction_language_families", map_definition)
        north = map_definition["regions"]["North"]
        self.assertEqual(north["display_name"], "North")
        self.assertEqual(north["founding_name"], "North")
        self.assertEqual(north["name_metadata"]["authored_name"], "North")
        self.assertEqual(north["name_metadata"]["source"], "world_builder")

    def test_export_infers_sea_links_from_ocean_adjacency(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "water_gap.azmap"
        _write_test_map(
            map_path,
            regions={
                "West": {"name": "West", "color": "#aaaaaa"},
                "East": {"name": "East", "color": "#bbbbbb"},
                "Inland": {"name": "Inland", "color": "#cccccc"},
            },
            hexes={
                "-1,0": {"q": -1, "r": 0, "terrain": "forest", "region": "Inland"},
                "0,0": {"q": 0, "r": 0, "terrain": "grassland", "region": "West"},
                "1,0": {"q": 1, "r": 0, "terrain": "ocean"},
                "2,0": {"q": 2, "r": 0, "terrain": "hills", "region": "East"},
            },
        )
        try:
            map_definition = translate(map_path, num_factions=2)
        finally:
            shutil.rmtree(tmp_dir)

        sea_links = {tuple(link) for link in map_definition["sea_links"]}
        self.assertIn(("East", "West"), sea_links)
        self.assertIn("coast", map_definition["regions"]["West"]["terrain_tags"])
        self.assertIn("coast", map_definition["regions"]["East"]["terrain_tags"])
        self.assertNotIn("coast", map_definition["regions"]["Inland"]["terrain_tags"])

    def test_export_keeps_connected_ocean_links_local(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "long_ocean.azmap"
        hexes = {
            "0,0": {"q": 0, "r": 0, "terrain": "grassland", "region": "West"},
            "5,0": {"q": 5, "r": 0, "terrain": "forest", "region": "NearIsland"},
            "20,0": {"q": 20, "r": 0, "terrain": "tundra", "region": "FarNorth"},
        }
        for q in range(1, 20):
            if q not in {5}:
                hexes[f"{q},0"] = {"q": q, "r": 0, "terrain": "ocean"}

        _write_test_map(
            map_path,
            regions={
                "West": {"name": "West", "color": "#aaaaaa"},
                "NearIsland": {"name": "Near Island", "color": "#bbbbbb"},
                "FarNorth": {"name": "Far North", "color": "#cccccc"},
            },
            hexes=hexes,
        )
        try:
            map_definition = translate(map_path, num_factions=2)
        finally:
            shutil.rmtree(tmp_dir)

        sea_links = {tuple(link) for link in map_definition["sea_links"]}
        self.assertIn(("NearIsland", "West"), sea_links)
        self.assertNotIn(("FarNorth", "West"), sea_links)

    def test_export_treats_unregioned_coast_as_maritime_water(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "coastal_water_gap.azmap"
        _write_test_map(
            map_path,
            regions={
                "Mainland": {"name": "Mainland", "color": "#aaaaaa"},
                "Island": {"name": "Island", "color": "#bbbbbb"},
            },
            hexes={
                "0,0": {"q": 0, "r": 0, "terrain": "grassland", "region": "Mainland"},
                "1,0": {"q": 1, "r": 0, "terrain": "coast"},
                "2,0": {"q": 2, "r": 0, "terrain": "ocean"},
                "3,0": {"q": 3, "r": 0, "terrain": "coast"},
                "4,0": {"q": 4, "r": 0, "terrain": "forest", "region": "Island"},
            },
        )
        try:
            map_definition = translate(map_path, num_factions=2)
        finally:
            shutil.rmtree(tmp_dir)

        sea_links = {tuple(link) for link in map_definition["sea_links"]}
        self.assertIn(("Island", "Mainland"), sea_links)
        self.assertIn("coast", map_definition["regions"]["Mainland"]["terrain_tags"])
        self.assertIn("coast", map_definition["regions"]["Island"]["terrain_tags"])

    def test_export_normalizes_legacy_hex_climate(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "legacy_climate.azmap"
        _write_test_map(
            map_path,
            regions={"North": {"name": "North", "color": "#aaaaaa"}},
            hexes={
                "0,0": {"q": 0, "r": 0, "terrain": "grassland", "region": "North", "climate": "temperate"},
                "1,0": {"q": 1, "r": 0, "terrain": "forest", "region": "North", "climate": "oceanic"},
            },
        )
        try:
            map_definition = translate(map_path, num_factions=1)
        finally:
            shutil.rmtree(tmp_dir)

        self.assertEqual(map_definition["regions"]["North"]["climate"], "Cfb")

    def test_export_preserves_direct_koppen_hex_climate(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "koppen_climate.azmap"
        _write_test_map(
            map_path,
            regions={"Steppe": {"name": "Steppe", "color": "#aaaaaa"}},
            hexes={
                "0,0": {"q": 0, "r": 0, "terrain": "plains", "region": "Steppe", "climate": "BSh"},
                "1,0": {"q": 1, "r": 0, "terrain": "plains", "region": "Steppe", "climate": "BSh"},
            },
        )
        try:
            map_definition = translate(map_path, num_factions=1)
        finally:
            shutil.rmtree(tmp_dir)

        self.assertEqual(map_definition["regions"]["Steppe"]["climate"], "BSh")

    def test_painted_dominant_climate_beats_region_override(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "region_override.azmap"
        _write_test_map(
            map_path,
            regions={"South": {"name": "South", "color": "#aaaaaa", "climate": "Csa"}},
            hexes={
                "0,0": {"q": 0, "r": 0, "terrain": "jungle", "region": "South", "climate": "Af"},
                "1,0": {"q": 1, "r": 0, "terrain": "jungle", "region": "South", "climate": "Af"},
            },
        )
        try:
            map_definition = translate(map_path, num_factions=1)
        finally:
            shutil.rmtree(tmp_dir)

        self.assertEqual(map_definition["regions"]["South"]["climate"], "Af")

    def test_export_rejects_unknown_climate(self):
        tmp_dir = ROOT / ".tmp_clashvergence_export_tests"
        tmp_dir.mkdir(exist_ok=True)
        map_path = tmp_dir / "unknown_climate.azmap"
        _write_test_map(
            map_path,
            regions={"Nowhere": {"name": "Nowhere", "color": "#aaaaaa"}},
            hexes={
                "0,0": {"q": 0, "r": 0, "terrain": "plains", "region": "Nowhere", "climate": "moonlit"},
            },
        )
        try:
            with self.assertRaises(ValueError):
                translate(map_path, num_factions=1)
        finally:
            shutil.rmtree(tmp_dir)


if __name__ == "__main__":
    unittest.main()
