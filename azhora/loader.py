import re
import unicodedata
from pathlib import Path

import yaml

from .models import LoreEntry

LORE_ROOT = Path(__file__).parent.parent / "lore"

CATEGORY_ALIASES = {
    "region": "geography",
}


class LoreParseError(ValueError):
    """Raised when a frontmatter-backed lore file cannot be parsed."""


def normalize_key(value: str) -> str:
    """Normalize names for forgiving lookups and cross-reference checks."""
    decomposed = unicodedata.normalize("NFKD", value)
    asciiish = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", asciiish.lower()).strip()


def normalize_category(category: str) -> str:
    cleaned = category.strip().lower()
    return CATEGORY_ALIASES.get(cleaned, cleaned)


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _split_frontmatter(path: Path, text: str) -> tuple[str, str] | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None

    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            frontmatter = "\n".join(lines[1:index])
            body = "\n".join(lines[index + 1:]).strip()
            return frontmatter, body

    raise LoreParseError(f"{path}: missing closing frontmatter delimiter")


def _parse_file(path: Path, lore_root: Path = LORE_ROOT) -> LoreEntry | None:
    text = path.read_text(encoding="utf-8")
    parts = _split_frontmatter(path, text)
    if parts is None:
        return None

    frontmatter_text, body = parts
    frontmatter = yaml.safe_load(frontmatter_text) or {}
    if not isinstance(frontmatter, dict):
        raise LoreParseError(f"{path}: frontmatter must be a mapping")

    return LoreEntry(
        name=str(frontmatter.get("name", path.stem)),
        category=normalize_category(str(frontmatter.get("category", path.parent.name))),
        tags=_as_list(frontmatter.get("tags")),
        related=_as_list(frontmatter.get("related")),
        status=str(frontmatter.get("status", "draft")),
        body=body,
        source_file=str(path.relative_to(lore_root.parent)),
    )


def load_all(lore_root: Path = LORE_ROOT) -> list[LoreEntry]:
    entries = []
    for path in lore_root.rglob("*.md"):
        entry = _parse_file(path, lore_root)
        if entry:
            entries.append(entry)
    entries.sort(key=lambda e: (e.category, e.name))
    return entries


def find(name: str, entries: list[LoreEntry] | None = None) -> LoreEntry | None:
    all_entries = entries or load_all()
    key = normalize_key(name)
    return next(
        (
            e
            for e in all_entries
            if normalize_key(e.name) == key
            or normalize_key(Path(e.source_file).stem) == key
        ),
        None,
    )


def search(query: str, entries: list[LoreEntry] | None = None) -> list[LoreEntry]:
    all_entries = entries or load_all()
    q = normalize_key(query)
    return [
        e for e in all_entries
        if q in normalize_key(e.name)
        or q in normalize_key(e.body)
        or any(q in normalize_key(t) for t in e.tags)
    ]
