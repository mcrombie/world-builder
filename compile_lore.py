"""
compile_lore.py — Compile azhora_lore/ markdown files into a single .azlore JSON bundle.

Usage:
    python compile_lore.py [--lore-dir azhora_lore] [--out azhora.azlore] [--world Azhora]
                           [--include-catalogues]

Run this whenever lore files change. The output is loaded by the world-builder
to enable manual region → lore entry linking in the editor.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent

# Files too large for practical UI display (flora catalogues).
# Included with --include-catalogues flag.
CATALOGUE_FILES = {"ibenwood_flora", "ibenwood_groundflora"}

# Directory to skip entirely (old archived map file).
SKIP_DIRS = {"azhora_lore_map"}

# Category inference from subdirectory path when frontmatter category is missing.
DIR_TO_CATEGORY: dict[str, str] = {
    "geography/regions": "region",
    "geography/phenomena": "phenomenon",
    "geography": "geography",
    "peoples/languages": "language",
    "peoples": "peoples",
    "culture": "culture",
    "history": "history",
    "artifacts": "artifact",
    "cosmology": "cosmology",
    "fauna": "fauna",
}


# ── Frontmatter parsing ───────────────────────────────────────────────────────

_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_TAG_LIST_RE = re.compile(r"^\[(.+)\]$")
_YAML_LIST_RE = re.compile(r"^\s*-\s+(.+)$")


def _parse_yaml_value(raw: str) -> str | list[str]:
    """Parse a simple YAML value: either a scalar or an inline list."""
    raw = raw.strip()
    m = _TAG_LIST_RE.match(raw)
    if m:
        # Inline list: [a, b, c]
        return [item.strip().strip('"').strip("'") for item in m.group(1).split(",")]
    return raw


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body_without_frontmatter)."""
    m = _FM_RE.match(text)
    if not m:
        return {}, text.strip()

    fm_raw = m.group(1)
    body = text[m.end():].strip()
    fm: dict = {}
    current_key: str | None = None
    list_values: list[str] = []

    for line in fm_raw.splitlines():
        # Continuation of a block list
        lm = _YAML_LIST_RE.match(line)
        if lm and current_key and isinstance(fm.get(current_key), list):
            fm[current_key].append(lm.group(1).strip().strip('"').strip("'"))
            continue

        # Key: value line
        if ":" in line:
            if current_key and list_values:
                fm[current_key] = list_values
            kv = line.split(":", 1)
            key = kv[0].strip()
            val = kv[1].strip() if len(kv) > 1 else ""
            current_key = key
            list_values = []
            if val:
                parsed = _parse_yaml_value(val)
                if isinstance(parsed, list):
                    fm[key] = parsed
                else:
                    fm[key] = parsed
            else:
                # Value will be a block list — initialise as list
                fm[key] = []

    if current_key and isinstance(fm.get(current_key), list) and not fm[current_key]:
        # Empty list key with no items — leave as []
        pass

    return fm, body


# ── Summary extraction ────────────────────────────────────────────────────────

_H1_RE = re.compile(r"^#\s+.+$", re.MULTILINE)
_SECTION_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)


def extract_summary(body: str, max_chars: int = 400) -> str:
    """
    Extract the first meaningful paragraph after the H1 heading.
    Falls back to the first non-empty paragraph if no H1 is found.
    """
    h1_match = _H1_RE.search(body)
    if h1_match:
        text_after = body[h1_match.end():].strip()
    else:
        text_after = body.strip()

    paragraphs = re.split(r"\n{2,}", text_after)
    for para in paragraphs:
        para = para.strip()
        # Skip section headings, empty lines, horizontal rules, code blocks
        if not para:
            continue
        if _SECTION_RE.match(para):
            continue
        if para.startswith("---") or para.startswith("```"):
            continue
        # Strip inline markdown: bold, italic, links
        clean = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", para)
        clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
        clean = re.sub(r"`([^`]+)`", r"\1", clean)
        clean = clean.strip()
        if len(clean) < 20:
            continue
        return clean[:max_chars] + ("…" if len(clean) > max_chars else "")

    return ""


# ── Category inference ────────────────────────────────────────────────────────

def infer_category(rel_path: Path, fm: dict) -> str:
    if "category" in fm and fm["category"]:
        return str(fm["category"]).strip()
    # Walk from most-specific to least-specific dir path
    parts = rel_path.parent.parts
    for length in range(len(parts), 0, -1):
        key = "/".join(parts[:length])
        if key in DIR_TO_CATEGORY:
            return DIR_TO_CATEGORY[key]
    return "misc"


# ── Main compilation ──────────────────────────────────────────────────────────

def compile_lore(
    lore_dir: Path,
    world_name: str,
    include_catalogues: bool = False,
) -> dict:
    entries: list[dict] = []
    skipped: list[str] = []

    for md_path in sorted(lore_dir.rglob("*.md")):
        rel = md_path.relative_to(lore_dir)

        # Skip blacklisted directories
        if any(part in SKIP_DIRS for part in rel.parts):
            continue

        stem = md_path.stem
        if stem in CATALOGUE_FILES and not include_catalogues:
            skipped.append(str(rel))
            continue

        text = md_path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)

        entry_id = stem
        name = str(fm.get("name", stem)).strip()
        category = infer_category(rel, fm)
        tags_raw = fm.get("tags", [])
        tags = tags_raw if isinstance(tags_raw, list) else [str(tags_raw)]
        related_raw = fm.get("related", [])
        related = related_raw if isinstance(related_raw, list) else [str(related_raw)]
        summary = extract_summary(body)

        entries.append({
            "id":         entry_id,
            "name":       name,
            "category":   category,
            "tags":       tags,
            "related":    related,
            "summary":    summary,
            "body":       body,
            "sourcePath": str(rel).replace("\\", "/"),
        })

    entries.sort(key=lambda e: (e["category"], e["name"].lower()))

    if skipped:
        print(f"  Skipped catalogues ({len(skipped)}): {', '.join(skipped)}")
        print("  Use --include-catalogues to include them.")

    return {
        "azlore":      True,
        "worldName":   world_name,
        "version":     "1",
        "compiledAt":  datetime.now(timezone.utc).isoformat(),
        "entries":     entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lore-dir",           default="azhora_lore",   help="Path to lore directory")
    parser.add_argument("--out",                default="azhora.azlore", help="Output .azlore file path")
    parser.add_argument("--world",              default="Azhora",        help="World name stored in the bundle")
    parser.add_argument("--include-catalogues", action="store_true",     help="Include large flora catalogue files")
    args = parser.parse_args()

    lore_dir = ROOT / args.lore_dir
    out_path = ROOT / args.out

    if not lore_dir.exists():
        print(f"Error: lore directory not found: {lore_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Compiling lore from: {lore_dir}")
    bundle = compile_lore(lore_dir, args.world, include_catalogues=args.include_catalogues)

    count = len(bundle["entries"])
    out_path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Written: {out_path}  ({count} entries)")


if __name__ == "__main__":
    main()
