import json
import shutil
import unittest
from pathlib import Path

from wwmap_to_clashvergence import translate


ROOT = Path(__file__).parent


class ClashvergenceExportTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
