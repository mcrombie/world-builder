// Inline type mirrors of renderer/src/lib/fileIO.ts — kept in sync manually.
// Cannot import from renderer src here (would break ambient declaration scope).
interface _SaveResult   { filePath?: string; canceled?: boolean }
interface _LoadResult   { data?: string; filePath?: string; canceled?: boolean; error?: string }
interface _ImageResult  { dataUrl?: string; filePath?: string; canceled?: boolean }
interface _RecentFile   { path: string; name: string; savedAt: string }
interface _ExampleMeta  { id: string; name: string; description: string }

interface _SimFaction   { name: string; display_name: string; treasury: number; owned_regions: number; population: number; doctrine_label: string }
interface _SimRegion    { name: string; display_name: string; owner: string | null; population: number; resources: number; unrest: number }
interface _SimWorld     { ok?: boolean; error?: string; turn: number; turn_label: string; factions: _SimFaction[]; regions: _SimRegion[]; recent_events: unknown[] }
interface _SimStartResult { ok: boolean; error?: string; canceled?: boolean; world?: _SimWorld; seed?: string }
interface _SimSaveResult  { ok?: boolean; error?: string; canceled?: boolean; filePath?: string }

interface _LoreResult { data?: string; filePath?: string; canceled?: boolean; error?: string }

export interface ElectronAPI {
  lore: {
    load: () => Promise<_LoreResult>
  }
  map: {
    save:        (jsonData: string, filePath?: string) => Promise<_SaveResult>
    load:        () => Promise<_LoadResult>
    loadByPath:  (path: string)                        => Promise<_LoadResult>
    chooseImage: () => Promise<_ImageResult>
    listRecent:   () => Promise<_RecentFile[]>
    addRecent:    (path: string, name: string)          => Promise<void>
    listExamples: () => Promise<_ExampleMeta[]>
    loadExample:  (id: string)                          => Promise<_LoadResult>
  }
  sim: {
    start:        (mapFilePath: string, numFactions?: number, simType?: string, seed?: string) => Promise<_SimStartResult>
    stop:         ()                    => Promise<{ ok: boolean }>
    world:        ()                    => Promise<_SimWorld>
    advance:      ()                    => Promise<_SimWorld>
    saveState:    ()                    => Promise<_SimSaveResult>
    loadAndStart: ()                    => Promise<_SimStartResult>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
