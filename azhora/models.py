from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LoreEntry:
    name: str
    category: str
    tags: list[str] = field(default_factory=list)
    body: str = ""
    source_file: str = ""
    related: list[str] = field(default_factory=list)
    status: str = "draft"

    def summary(self, width: int = 80) -> str:
        first_para = next(
            (line.strip() for line in self.body.splitlines() if line.strip() and not line.startswith("#")),
            ""
        )
        return first_para[:width] + ("..." if len(first_para) > width else "")
