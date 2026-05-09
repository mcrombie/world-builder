import sys
import textwrap
from azhora import load_all, find, search


def cmd_list(args: list[str]) -> None:
    entries = load_all()
    category_filter = args[0].lower() if args else None

    current_cat = None
    for e in entries:
        if category_filter and e.category.lower() != category_filter:
            continue
        if e.category != current_cat:
            current_cat = e.category
            print(f"\n  [{current_cat.upper()}]")
        tags = f"  ({', '.join(e.tags)})" if e.tags else ""
        print(f"    {e.name}{tags}")


def cmd_show(args: list[str]) -> None:
    if not args:
        print("Usage: show <name>")
        return
    entry = find(args[0])
    if not entry:
        print(f"No entry found: {args[0]}")
        return

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


def cmd_search(args: list[str]) -> None:
    if not args:
        print("Usage: search <query>")
        return
    results = search(" ".join(args))
    if not results:
        print("No results.")
        return
    for e in results:
        print(f"\n  {e.name}  [{e.category}]")
        print(f"  {e.summary()}")


COMMANDS = {"list": cmd_list, "show": cmd_show, "search": cmd_search}

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] not in COMMANDS:
        print("Azhora World Lore\n")
        print("  python main.py list [category]")
        print("  python main.py show <name>")
        print("  python main.py search <query>")
        sys.exit(0)
    COMMANDS[args[0]](args[1:])
