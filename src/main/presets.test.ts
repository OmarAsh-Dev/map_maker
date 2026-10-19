import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PresetStore } from './presets'

const STYLE_JSON = JSON.stringify(
  { version: 8, name: 'Test Style', layers: [{ id: 'bg', type: 'background' }] },
  null,
  2
)

let dir: string
let store: PresetStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'map-maker-presets-'))
  store = new PresetStore(dir)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('PresetStore', () => {
  it('save then list shows the entry', async () => {
    await store.save('My Preset', STYLE_JSON)

    const entries = await store.list()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('My Preset')
    expect(typeof entries[0]?.mtime).toBe('number')
  })

  it('save then load returns the identical JSON string', async () => {
    await store.save('style-a', STYLE_JSON)

    const loaded = await store.load('style-a')

    expect(loaded).toBe(STYLE_JSON)
  })

  it('load of a missing name returns null', async () => {
    expect(await store.load('does-not-exist')).toBeNull()
  })

  it('remove deletes the preset', async () => {
    await store.save('gone-soon', STYLE_JSON)
    await store.remove('gone-soon')

    expect(await store.list()).toEqual([])
    expect(await store.load('gone-soon')).toBeNull()
  })

  it('traversal name ../evil stays inside the dir', async () => {
    await store.save('../evil', STYLE_JSON)

    const escapedPath = resolve(dir, '..', 'evil.json')
    await expect(stat(escapedPath)).rejects.toMatchObject({ code: 'ENOENT' })

    const raw = await readFile(join(dir, 'evil.json'), 'utf8')
    expect(raw).toBe(STYLE_JSON)
    expect(await store.load('../evil')).toBe(STYLE_JSON)
  })

  it('rejects unsanitizable names', async () => {
    await expect(store.save('', STYLE_JSON)).rejects.toThrow(/invalid preset name/i)
    await expect(store.save('.', STYLE_JSON)).rejects.toThrow(/invalid preset name/i)
    await expect(store.save('..', STYLE_JSON)).rejects.toThrow(/invalid preset name/i)
    await expect(store.save('bad<name', STYLE_JSON)).rejects.toThrow(/invalid preset name/i)
  })

  it('list is sorted by name', async () => {
    await store.save('b', STYLE_JSON)
    await store.save('a', STYLE_JSON)
    await store.save('c', STYLE_JSON)

    const names = (await store.list()).map((e) => e.name)

    expect(names).toEqual(['a', 'b', 'c'])
  })

  it('list of a missing dir returns an empty array', async () => {
    const fresh = new PresetStore(join(dir, 'nope'))

    expect(await fresh.list()).toEqual([])
  })

  it('files live in the injected dir, not real userData', async () => {
    await store.save('where', STYLE_JSON)

    const info = await stat(join(dir, 'where.json'))
    expect(info.isFile()).toBe(true)
  })
})
