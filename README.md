# Azhora

Azhora is a worldbuilding repository for the fictional world of Corav, centered on the continent of Azhora.

The project has two tracks:

- `lore/` — canonical world documents in Markdown with YAML frontmatter.
- `map/` — an Electron + React hex map editor for drawing, annotating, and exporting the world.

---

## Repository Layout

```text
.
├── lore/
│   ├── artifacts/
│   ├── cosmology/
│   ├── culture/
│   ├── fauna/
│   ├── geography/
│   ├── history/
│   └── peoples/
├── map/                    # Electron hex map editor
│   ├── src/
│   │   ├── main/           # Electron main process
│   │   ├── preload/        # IPC bridge
│   │   └── renderer/       # React + Vite frontend
│   └── package.json
├── docs/                   # Design documents and planned features
└── ROADMAP.md
```

---

## Hex Map Editor

The map editor is a desktop app built with Electron, React, Vite, and Tailwind. It lets you draw and annotate a hex grid world.

### Features

- Paint terrain (ocean, coast, plains, hills, forest, mountains, desert, tundra, wetland)
- Draw rivers on hex edges
- Define named regions with color, faction, climate, status, and notes
- Place and size settlements
- Annotate individual hexes with notes
- Generate random maps at 10 size scales (hamlet to world) with terrain noise
- Resize maps after creation
- Load/save `.azmap` map files
- Underlay a reference image beneath the grid
- Undo support

### Running the editor

```powershell
cd map
npm install        # first time only
npm run dev        # launches the Electron window
```

### Building

```powershell
npm run build
```

---

## Lore File Format

Lore files are Markdown documents under `lore/` with YAML frontmatter:

```markdown
---
name: Corav
category: geography
tags: [world, planet, overview]
status: draft
related: [Azhora]
---

Body text here.
```

Supported frontmatter fields: `name`, `category`, `tags`, `status`, `related`.

---

## World Summary

Azhora is a world of overlapping valid records: maps, routes, ruins, carvings, songs, scripts, knots, grammar, children's drawings, and places that remember. The big mysteries are intentionally not solved.

The continent of Azhora runs roughly north to south on the planet Corav. Its major regions — Mittolo, Pyros, North Azhora, the Plains, the Moroshe Desert, the Iberos Coast, Bouen, and Amod — each have their own terrain, culture, language family, and relationship to the continent's unresolved history. Geography, languages, peoples, cultures, artifacts, and cosmology are documented in `lore/`.

See `ROADMAP.md` for the lore roadmap, `docs/app_roadmap.md` for the app roadmap,
and `docs/clashvergence_integration_roadmap.md` for the Clashvergence bridge plan.
