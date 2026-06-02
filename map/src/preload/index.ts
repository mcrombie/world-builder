import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  map: {
    save:        (jsonData: string, filePath?: string) => ipcRenderer.invoke('map:save', jsonData, filePath),
    load:        ()                                    => ipcRenderer.invoke('map:load'),
    loadByPath:  (path: string)                        => ipcRenderer.invoke('map:load-by-path', path),
    chooseImage: ()                                    => ipcRenderer.invoke('map:choose-image'),
    listRecent:  ()                                    => ipcRenderer.invoke('map:list-recent'),
    addRecent:   (path: string, name: string)          => ipcRenderer.invoke('map:add-recent', path, name),
    listExamples: ()                                   => ipcRenderer.invoke('map:list-examples'),
    loadExample:  (id: string)                         => ipcRenderer.invoke('map:load-example', id),
  },
  lore: {
    load: () => ipcRenderer.invoke('lore:load'),
  },
  sim: {
    start:         (mapFilePath: string, numFactions?: number, simType?: string, seed?: string) => ipcRenderer.invoke('sim:start', mapFilePath, numFactions ?? 9, simType ?? 'clashvergence', seed ?? ''),
    stop:          ()                    => ipcRenderer.invoke('sim:stop'),
    world:         ()                    => ipcRenderer.invoke('sim:world'),
    advance:       ()                    => ipcRenderer.invoke('sim:advance'),
    saveState:     ()                    => ipcRenderer.invoke('sim:save-state'),
    loadAndStart:  ()                    => ipcRenderer.invoke('sim:load-and-start'),
  },
})
