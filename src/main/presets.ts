import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

export interface PresetMeta {
  name: string
  mtime: number
}

const EXTENSION = '.json'
const MAX_NAME_LENGTH = 100
const ILLEGAL_CHARS = /[<>:"|?*\u0000-\u001F]/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export class PresetStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = resolve(dir)
  }

  private safeName(name: string): string {
    const base = basename(String(name).replace(/[/\\]+/g, '/'))
    if (
      base.length === 0 ||
      base === '.' ||
      base === '..' ||
      base.length > MAX_NAME_LENGTH ||
      ILLEGAL_CHARS.test(base) ||
      /[. ]$/.test(base) ||
      WINDOWS_RESERVED.test(base)
    ) {
      throw new Error(`Invalid preset name: ${JSON.stringify(name)}`)
    }
    return base
  }

  private pathFor(name: string): string {
    const file = resolve(join(this.dir, `${this.safeName(name)}${EXTENSION}`))
    if (!file.startsWith(this.dir + sep)) {
      throw new Error(`Invalid preset name: ${JSON.stringify(name)}`)
    }
    return file
  }

  async save(name: string, styleJson: string): Promise<void> {
    const file = this.pathFor(name)
    await mkdir(this.dir, { recursive: true })
    await writeFile(file, styleJson, 'utf8')
  }

  async list(): Promise<PresetMeta[]> {
    let entries: string[]
    try {
      entries = await readdir(this.dir)
    } catch {
      return []
    }
    const metas: PresetMeta[] = []
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue
      const name = entry.slice(0, -EXTENSION.length)
      if (!name) continue
      try {
        const info = await stat(join(this.dir, entry))
        if (info.isFile()) {
          metas.push({ name, mtime: info.mtimeMs })
        }
      } catch {
        continue
      }
    }
    return metas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  async load(name: string): Promise<string | null> {
    const file = this.pathFor(name)
    try {
      return await readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async remove(name: string): Promise<void> {
    const file = this.pathFor(name)
    try {
      await unlink(file)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }
  }
}
