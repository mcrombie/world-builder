from collections import Counter
import sys
import textwrap
from azhora import check_lore, find, load_all, normalize_category, normalize_key, search


def configure_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def print_usage() -> None:
    print("Azhora World Lore\n")
    print("  python main.py list [category] [--tag tag]")
    print("  python main.py show <name>")
    print("  python main.py search <query>")
    print("  python main.py check [--strict]")


def _parse_list_args(args: list[str]) -> tuple[str | None, list[str]] | None:
    category_filter = None
    tag_filters: list[str] = []
    index = 0

    while index < len(args):
        arg = args[index]
        if arg == "--tag":
            if index + 1 >= len(args):
                print("Usage: list [category] [--tag tag]")
                return None
            tag_filters.append(normalize_key(args[index + 1]))
            index += 2
        elif arg.startswith("--"):
            print(f"Unknown option: {arg}")
            return None
        elif category_filter is None:
            category_filter = normalize_category(arg)
            index += 1
        else:
            print("Usage: list [category] [--tag tag]")
            return None

    return category_filter, tag_filters


def cmd_list(args: list[str]) -> int:
    parsed = _parse_list_args(args)
    if parsed is None:
        return 2
    category_filter, tag_filters = parsed

    entries = load_all()

    current_cat = None
    for e in entries:
        if category_filter and e.category != category_filter:
            continue
        entry_tags = {normalize_key(tag) for tag in e.tags}
        if tag_filters and not all(tag in entry_tags for tag in tag_filters):
            continue
        if e.category != current_cat:
            current_cat = e.category
            print(f"\n  [{current_cat.upper()}]")
        tags = f"  ({', '.join(e.tags)})" if e.tags else ""
        print(f"    {e.name}{tags}")
    return 0


def cmd_show(args: list[str]) -> int:
    if not args:
        print("Usage: show <name>")
        return 2
    entry = find(" ".join(args))
    if not entry:
        print(f"No entry found: {' '.join(args)}")
        return 1

    width = 72
    print(f"\n{'=' * width}")
    print(f"  {entry.name}  [{entry.category}]")
    print(f"  Tags: {', '.join(entry.tags) or 'none'}")
    if entry.related:
        print(f"  Related: {', '.join(entry.related)}")
    print(f"{'=' * width}\n")
    for line in entry.body.splitlines():
        if line.startswith("#"):
            print(f"\n{line}")
        else:
            print(textwrap.fill(line, width=width) if line.strip() else "")
    print()
    return 0


def cmd_search(args: list[str]) -> int:
    if not args:
        print("Usage: search <query>")
        return 2
    results = search(" ".join(args))
    if not results:
        print("No results.")
        return 1
    for e in results:
        print(f"\n  {e.name}  [{e.category}]")
        print(f"  {e.summary()}")
    return 0


def cmd_check(args: list[str]) -> int:
    strict = False
    for arg in args:
        if arg == "--strict":
            strict = True
        else:
            print(f"Unknown option: {arg}")
            return 2

    report = check_lore()
    category_counts = Counter(e.category for e in report.entries)
    issue_counts = Counter(issue.code for issue in report.issues)

    print(f"Entries: {len(report.entries)}")
    print("Categories:")
    for category, count in sorted(category_counts.items()):
        print(f"  {category}: {count}")

    print(f"\nIssues: {len(report.issues)}")
    for code, count in sorted(issue_counts.items()):
        print(f"  {code}: {count}")

    if report.issues:
        print("\nDetails:")
    for issue in report.issues:
        location = f" ({issue.source_file})" if issue.source_file else ""
        print(f"  [{issue.severity}] {issue.code}: {issue.message}{location}")

    if report.errors:
        return 1
    if strict and report.warnings:
        return 1
    return 0


COMMANDS = {"list": cmd_list, "show": cmd_show, "search": cmd_search, "check": cmd_check}

if __name__ == "__main__":
    configure_output()
    args = sys.argv[1:]
    if not args or args[0] not in COMMANDS:
        print_usage()
        sys.exit(0)
    sys.exit(COMMANDS[args[0]](args[1:]))
