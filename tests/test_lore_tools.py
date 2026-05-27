import shutil
import textwrap
import uuid
import unittest
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path

from azhora import LoreParseError, check_entries, find, load_all, normalize_key, search

TMP_ROOT = Path(__file__).parent / ".tmp"


@contextmanager
def temp_workspace() -> Iterator[Path]:
    TMP_ROOT.mkdir(exist_ok=True)
    path = TMP_ROOT / f"case_{uuid.uuid4().hex}"
    path.mkdir()
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def write_lore(root: Path, relative_path: str, frontmatter: str, body: str = "Body text.") -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{textwrap.dedent(frontmatter).strip()}\n---\n\n{body}\n", encoding="utf-8")


class LoreLoaderTests(unittest.TestCase):
    def test_load_all_parses_frontmatter_and_normalizes_region_category(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(
                lore_root,
                "geography/regions/bouen.md",
                """
                name: Bouén
                category: region
                tags: [coast, fog]
                related: [Azhora]
                """,
            )
            (lore_root / "notes.md").write_text("No frontmatter here.", encoding="utf-8")

            entries = load_all(lore_root)

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].name, "Bouén")
        self.assertEqual(entries[0].category, "geography")
        self.assertEqual(entries[0].source_file, str(Path("lore/geography/regions/bouen.md")))

    def test_malformed_frontmatter_raises_parse_error(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            path = lore_root / "broken.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("---\nname: Broken\n\nBody", encoding="utf-8")

            with self.assertRaises(LoreParseError):
                load_all(lore_root)

    def test_find_matches_accents_and_filename_style(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(lore_root, "peoples/languages/boueni.md", "name: Bouéni Language\ncategory: language")
            entries = load_all(lore_root)

        self.assertIs(find("Boueni Language", entries), entries[0])
        self.assertIs(find("boueni", entries), entries[0])

    def test_search_matches_normalized_body_and_tags(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(
                lore_root,
                "geography/moroshe.md",
                "name: Moroshé Desert\ncategory: geography\ntags: [Qadimuur]",
                "The canyon cisterns preserve older memory.",
            )
            entries = load_all(lore_root)

        self.assertEqual([entry.name for entry in search("moroshe", entries)], ["Moroshé Desert"])
        self.assertEqual([entry.name for entry in search("qadimuur", entries)], ["Moroshé Desert"])

    def test_scalar_tags_and_related_are_coerced_to_lists(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(lore_root, "geography/corav.md", "name: Corav\ncategory: geography\ntags: world\nrelated: Azhora")
            entries = load_all(lore_root)

        self.assertEqual(entries[0].tags, ["world"])
        self.assertEqual(entries[0].related, ["Azhora"])

    def test_normalize_key_removes_accents_punctuation_and_case(self) -> None:
        self.assertEqual(normalize_key("The Bouéni-Language!"), "the boueni language")


class LoreValidationTests(unittest.TestCase):
    def test_check_entries_reports_missing_related_references(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(
                lore_root,
                "geography/corav.md",
                "name: Corav\ncategory: geography\nrelated: [Azhora, Western Shore]",
            )
            write_lore(lore_root, "geography/azhora.md", "name: Azhora\ncategory: geography")
            entries = load_all(lore_root)

        issues = check_entries(entries)

        self.assertTrue(any(issue.code == "missing-related" and "Western Shore" in issue.message for issue in issues))
        self.assertFalse(any(issue.code == "missing-related" and "Azhora" in issue.message for issue in issues))

    def test_check_entries_reports_duplicate_normalized_names_as_errors(self) -> None:
        with temp_workspace() as temp:
            lore_root = temp / "lore"
            write_lore(lore_root, "a.md", "name: Bouén\ncategory: geography")
            write_lore(lore_root, "b.md", "name: Bouen\ncategory: geography")
            entries = load_all(lore_root)

        issues = check_entries(entries)

        duplicates = [issue for issue in issues if issue.code == "duplicate-name"]
        self.assertEqual(len(duplicates), 1)
        self.assertEqual(duplicates[0].severity, "error")


if __name__ == "__main__":
    unittest.main()
