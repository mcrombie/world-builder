from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .loader import LORE_ROOT, load_all, normalize_key
from .models import LoreEntry


@dataclass(frozen=True)
class LoreIssue:
    code: str
    message: str
    source_file: str = ""
    severity: str = "warning"


@dataclass
class LoreReport:
    entries: list[LoreEntry] = field(default_factory=list)
    issues: list[LoreIssue] = field(default_factory=list)

    @property
    def warnings(self) -> list[LoreIssue]:
        return [issue for issue in self.issues if issue.severity == "warning"]

    @property
    def errors(self) -> list[LoreIssue]:
        return [issue for issue in self.issues if issue.severity == "error"]

    @property
    def ok(self) -> bool:
        return not self.errors


def _entry_keys(entry: LoreEntry) -> set[str]:
    path = Path(entry.source_file)
    return {
        normalize_key(entry.name),
        normalize_key(path.stem),
        normalize_key(path.stem.replace("_", " ")),
    }


def _known_keys(entries: list[LoreEntry]) -> set[str]:
    keys: set[str] = set()
    for entry in entries:
        keys.update(k for k in _entry_keys(entry) if k)
    return keys


def check_entries(entries: list[LoreEntry]) -> list[LoreIssue]:
    issues: list[LoreIssue] = []

    names = defaultdict(list)
    for entry in entries:
        names[normalize_key(entry.name)].append(entry)
        if not entry.name.strip():
            issues.append(LoreIssue("empty-name", "Entry has an empty name.", entry.source_file, "error"))
        if not entry.category.strip():
            issues.append(LoreIssue("empty-category", f"{entry.name} has an empty category.", entry.source_file, "error"))
        if not entry.body.strip():
            issues.append(LoreIssue("empty-body", f"{entry.name} has an empty body.", entry.source_file, "warning"))

    for key, matches in sorted(names.items()):
        if key and len(matches) > 1:
            sources = ", ".join(entry.source_file for entry in matches)
            issues.append(LoreIssue("duplicate-name", f"Duplicate normalized entry name: {matches[0].name} ({sources})", severity="error"))

    keys = _known_keys(entries)
    missing_sources: dict[str, list[str]] = defaultdict(list)
    for entry in entries:
        for related in entry.related:
            if normalize_key(related) not in keys:
                missing_sources[related].append(entry.source_file)

    for related, sources in sorted(missing_sources.items(), key=lambda item: normalize_key(item[0])):
        count = len(sources)
        location = sources[0] if count == 1 else f"{sources[0]} (+{count - 1} more)"
        issues.append(
            LoreIssue(
                "missing-related",
                f"Related entry is not defined: {related}",
                location,
                "warning",
            )
        )

    category_counts = Counter(entry.category for entry in entries)
    for category, count in sorted(category_counts.items()):
        if count == 1:
            issues.append(
                LoreIssue(
                    "single-entry-category",
                    f"Category has only one entry: {category}",
                    severity="warning",
                )
            )

    return issues


def check_lore(lore_root: Path = LORE_ROOT) -> LoreReport:
    entries = load_all(lore_root)
    return LoreReport(entries=entries, issues=check_entries(entries))
