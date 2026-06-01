# Clashvergence Integration Roadmap

This roadmap narrows the app roadmap to one goal: make world-builder the
scenario editor and visual shell for Clashvergence, while Clashvergence remains
the simulation engine.

## North Star

`saved_maps/*.azmap` is the source of truth. A user should be able to edit a
map, click Simulate, inspect Clashvergence state on that same map, choose legal
player actions when desired, save or replay history, and return to map editing
without hand-editing `maps.py` or generated JSON.

## Current State

- World-builder can save and load map JSON files, including `.azmap`.
- The Electron main process can translate a map and launch a local simulation
  server.
- Clashvergence already accepts `--map-file`.
- `HexCanvas` already paints a simulation ownership overlay.
- `SimulationPanel` can show standings, recent events, advance turns, auto-play,
  save, reset, and stop.
- The bridge still has rough edges around file naming, stale generated map
  files, scenario authoring fields, and player action choice.

## Design Rules

- Keep map data and simulation state separate.
- Let the editor author geography and intentional scenario seeds.
- Let Clashvergence infer doctrine, resources, trade routes, unrest pressure,
  and other simulation texture unless the map explicitly overrides them.
- Prefer live server APIs over reimplementing Clashvergence rules in TypeScript.
- Keep generated files deterministic and disposable.

## Phase 0 - Bridge Hygiene

Purpose: make the existing Simulate button boringly reliable.

Tasks:

- Standardize `.azmap` as the preferred map extension while preserving `.wwmap`
  compatibility.
- Generate `.cmap.json` and `.cvmap.json` beside the source map with clean names:
  `azhora.azmap` -> `azhora.cmap.json`, not `azhora.azmap.cmap.json`.
- Include translator stdout and stderr in startup errors.
- Re-run translation every time simulation starts so generated maps never go
  stale after edits.
- Update bridge script docs from "Worldwright/.wwmap" to "world-builder/.azmap".
- Trim legacy terrain mappings to the current terrain system or move legacy
  aliases into one explicit compatibility table.

Acceptance criteria:

- A saved `.azmap` starts Clashvergence from the UI.
- Starting after a map edit uses the latest saved contents.
- Failure messages identify whether translation or server startup failed.
- A CLI translation of `saved_maps/azhora.azmap` writes a valid `.cmap.json`.

## Phase 1 - Scenario Authoring

Purpose: make map-authored starting conditions intentional without turning the
editor into a giant simulation spreadsheet.

Tasks:

- Extend `RegionData` with optional scenario seed fields:
  `resourceOverride`, `populationSeed`, `fortLevel`, and `strategicTags`.
- Add a compact "Scenario" section to the region InfoPanel.
- Keep `faction` as the initial owner seed, but prepare for a scenario-level
  faction list so future dropdowns are not hardcoded.
- Update `wwmap_to_clashvergence.py` to pass through optional seed fields.
- Add a bridge validation script that reports isolated regions, unknown terrain,
  empty factions, missing starts, and generated file paths.

Acceptance criteria:

- Scenario fields survive save/load.
- Translator output includes optional fields only when set.
- Validation catches the common map mistakes before the server starts.

## Phase 2 - Live Simulation Inspection

Purpose: make the map itself the main simulation viewer.

Tasks:

- Add a selected-region simulation summary in `SimulationPanel`.
- Make region click selection work while simulating.
- Pin recent events to affected regions, at least as a filtered list for the
  selected region.
- Add map view modes for simulation: owner, unrest, resources, population, and
  recent conflict.
- Show neutral/unowned regions distinctly from owned territory.

Acceptance criteria:

- Clicking a simulated region shows current owner, population, resources,
  unrest, and recent events.
- Advancing a turn updates the map overlay and selected-region state.
- Owner coloring remains readable with terrain/river/settlement context.

## Phase 3 - Player Action Controls

Purpose: use Clashvergence's legal action API instead of auto-selecting the
first action.

Tasks:

- Expose `/api/state` through Electron as `sim.state`.
- Add `sim.action(actionId)` IPC/preload methods.
- Replace `SimulationPanel.advance` auto-choice with an action picker when the
  simulation is in player mode.
- Keep an "AI advance" or "auto-pick" command for observation mode.
- Display action consequences in plain language where the server payload
  provides enough information.

Acceptance criteria:

- The player can choose `develop`, `expand`, `attack`, or `skip` from visible
  legal actions.
- Invalid actions are rejected by Clashvergence and surfaced in the UI.
- Auto-play still works for hands-off observation.

## Phase 4 - History Recording And Replay

Purpose: turn simulations into inspectable historical artifacts.

Tasks:

- Add a record-history flow that advances N turns and stores snapshots.
- Save `.azhist.json` files containing map reference, sim type, seed, generated
  map file path, and turn snapshots.
- Add a replay panel with turn scrubber, play/pause, and event log.
- Reuse `HexCanvas` owner overlay for replay state.

Acceptance criteria:

- A 100-turn run can be recorded without manual clicking.
- Opening a history file can replay ownership changes on the map.
- The replay file remains separate from the `.azmap` source.

## Phase 5 - Calibration And Lore-Aware Scenarios

Purpose: make Azhora-specific simulations produce useful alternate histories.

Tasks:

- Create scenario JSON files for major Azhoran starting points.
- Add setup scripts that write faction and scenario seeds into `azhora.azmap`.
- Add batch calibration scripts that run many seeds and report outcomes.
- Extend event descriptions with lore-aware templates when region/faction lore
  is available.

Acceptance criteria:

- A named scenario can be applied to `saved_maps/azhora.azmap`.
- Batch runs produce a compact report of dominant factions, collapse patterns,
  and outlier events.
- Event logs become readable historical notes instead of only action labels.

## Implementation Slice 1

Start with Phase 0. It is small, testable, and removes the most likely source
of confusion before deeper UI work:

1. Normalize generated map output paths for `.azmap`, `.wwmap`, and `.json`.
2. Update translator/help text and terrain compatibility tables.
3. Add a bridge smoke command:
   `python wwmap_to_clashvergence.py saved_maps/azhora.azmap`.
4. Run the Electron build.

Once that passes, move to scenario seed fields in Phase 1.
