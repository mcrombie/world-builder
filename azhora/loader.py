import os
import yaml
from pathlib import Path
from .models import LoreEntry

LORE_ROOT = Path(__file__).parent.parent / "lore"


def _parse_file(path: Path) -> LoreEntry | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None

    end = text.index("---", 3)
    frontmatter = yaml.safe_load(text[3:end])
    body = text[end + 3:].strip()

    return LoreEntry(
        name=frontmatter.get("name", path.stem),
        category=frontmatter.get("category", path.parent.name),
        tags=frontmatter.get("tags", []),
        related=frontmatter.get("related", []),
        status=frontmatter.get("status", "draft"),
        body=body,
        source_file=str(path.relative_to(LORE_ROOT.parent)),
    )


def load_all() -> list[LoreEntry]:
    entries = []
    for path in LORE_ROOT.rglob("*.md"):
        entry = _parse_file(path)
        if entry:
            entries.append(entry)
    entries.sort(key=lambda e: (e.category, e.name))
    return entries


def find(name: str, entries: list[LoreEntry] | None = None) -> LoreEntry | None:
    all_entries = entries or load_all()
    name_lower = name.lower()
    return next(
        (e for e in all_entries if e.name.lower() == name_lower or Path(e.source_file).stem == name_lower),
        None,
    )


def search(query: str, entries: list[LoreEntry] | None = None) -> list[LoreEntry]:
    all_entries = entries or load_all()
    q = query.lower()
    return [
        e for e in all_entries
        if q in e.name.lower()
        or q in e.body.lower()
        or any(q in t.lower() for t in e.tags)
    ]
