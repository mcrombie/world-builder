export interface SaveMapResult { canceled: boolean; filePath?: string }
export interface LoadMapResult { canceled: boolean; data?: string; filePath?: string; error?: string }
export interface ImageResult   { canceled: boolean; dataUrl?: string }

export interface RecentFile {
  path: string
  name: string
  savedAt: string  // ISO string
}

export interface ExampleMeta {
  id: string
  name: string
  description: string
}

export interface FileIO {
  saveMap(json: string, currentPath?: string): Promise<SaveMapResult>
  loadMap(): Promise<LoadMapResult>
  loadByPath(path: string): Promise<LoadMapResult>
  chooseImage(): Promise<ImageResult>
  listRecent(): Promise<RecentFile[]>
  addRecent(path: string, name: string): Promise<void>
  listExamples(): Promise<ExampleMeta[]>
  loadExample(id: string): Promise<LoadMapResult>
}

// Set VITE_PLATFORM=browser in .env.browser to switch implementations.
// Default (undefined) uses Electron.
export const IS_BROWSER = import.meta.env.VITE_PLATFORM === 'browser'

const electronIO: FileIO = {
  saveMap:     (json, path) => (window as any).electronAPI.map.save(json, path),
  loadMap:     ()           => (window as any).electronAPI.map.load(),
  loadByPath:  (path)       => (window as any).electronAPI.map.loadByPath(path),
  chooseImage: ()           => (window as any).electronAPI.map.chooseImage(),
  listRecent:   ()           => (window as any).electronAPI.map.listRecent(),
  addRecent:    (path, name) => (window as any).electronAPI.map.addRecent(path, name),
  listExamples: ()           => (window as any).electronAPI.map.listExamples(),
  loadExample:  (id)         => (window as any).electronAPI.map.loadExample(id),
}

const browserIO: FileIO = {
  async saveMap(json, filename) {
    const name = filename?.replace(/[/\\]/g, '_') ?? 'my-world'
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: /\.(azmap|wwmap)$/i.test(name) ? name : `${name}.azmap`,
    })
    a.click()
    URL.revokeObjectURL(url)
    return { canceled: false, filePath: name }
  },

  loadMap() {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file', accept: '.wwmap,.azmap,.json',
      })
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return resolve({ canceled: true })
        resolve({ canceled: false, data: await file.text(), filePath: file.name })
      }
      input.click()
    })
  },

  loadByPath: async () => ({ canceled: true }),

  chooseImage() {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file', accept: 'image/*',
      })
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return resolve({ canceled: true })
        const reader = new FileReader()
        reader.onload = () => resolve({ canceled: false, dataUrl: reader.result as string })
        reader.readAsDataURL(file)
      }
      input.click()
    })
  },

  listRecent:   async () => [],
  addRecent:    async () => {},
  listExamples: async () => [],
  loadExample:  async () => ({ canceled: true }),
}

export const fileIO: FileIO = IS_BROWSER ? browserIO : electronIO
