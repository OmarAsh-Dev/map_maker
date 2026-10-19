import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPsd } from 'ag-psd'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CompositorChunk } from './compositor'
import { ExportSession, type ExportJobSpec, type ExportProgress } from './exportSession'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'map-maker-export-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function solidPng(r: number, g: number, b: number, size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .png()
    .toBuffer()
}

async function writePng(name: string, r: number, g: number, b: number, size = 64): Promise<Buffer> {
  const png = await solidPng(r, g, b, size)
  await writeFile(join(dir, name), png)
  return png
}

function collector(events: ExportProgress[]): (p: ExportProgress) => void {
  return (p) => events.push(p)
}

describe('ExportSession flat mode', () => {
  it('writes a single composited PNG to outPath with 128x128 dims from a 2x2 grid', async () => {
    const outPath = join(dir, 'map.png')
    const spec: ExportJobSpec = {
      mode: 'flat',
      container: 'png-folder',
      cols: 2,
      rows: 2,
      chunkPx: 64,
      actualWidth: 128,
      actualHeight: 128,
      outWidth: 128,
      outHeight: 128,
      groups: [],
      outPath,
      attribution: null,
    }
    const session = new ExportSession(spec, () => {})

    await session.addChunk('whatever-label', { col: 0, row: 0, png: await writePng('tl.png', 255, 0, 0) })
    await session.addChunk('whatever-label', { col: 1, row: 0, png: await writePng('tr.png', 0, 255, 0) })
    await session.addChunk('whatever-label', { col: 0, row: 1, png: await writePng('bl.png', 0, 0, 255) })
    await session.addChunk('whatever-label', { col: 1, row: 1, png: await writePng('br.png', 255, 255, 0) })
    await session.finish()

    const png = await readFile(outPath)
    const meta = await sharp(png).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)

    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    const sample = (x: number, y: number): [number, number, number] => {
      const i = (y * info.width + x) * info.channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    expect(sample(32, 32)).toEqual([255, 0, 0])
    expect(sample(96, 32)).toEqual([0, 255, 0])
    expect(sample(32, 96)).toEqual([0, 0, 255])
    expect(sample(96, 96)).toEqual([255, 255, 0])
  })

  it('rejects finish with an error event when chunks are missing', async () => {
    const outPath = join(dir, 'map.png')
    const spec: ExportJobSpec = {
      mode: 'flat',
      container: 'png-folder',
      cols: 2,
      rows: 2,
      chunkPx: 64,
      actualWidth: 128,
      actualHeight: 128,
      outWidth: 128,
      outHeight: 128,
      groups: [],
      outPath,
      attribution: null,
    }
    const events: ExportProgress[] = []
    const session = new ExportSession(spec, collector(events))

    await session.addChunk('flat', { col: 0, row: 0, png: await solidPng(255, 0, 0) })
    await session.addChunk('flat', { col: 1, row: 0, png: await solidPng(0, 255, 0) })
    await session.addChunk('flat', { col: 0, row: 1, png: await solidPng(0, 0, 255) })

    await expect(session.finish()).rejects.toThrow(/incomplete/i)
    const error = events.find((e) => e.stage === 'error')
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/incomplete/i)
    await expect(stat(outPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

function layeredSpec(container: 'psd' | 'png-folder', outPath: string): ExportJobSpec {
  return {
    mode: 'layered',
    container,
    cols: 1,
    rows: 1,
    chunkPx: 32,
    actualWidth: 32,
    actualHeight: 32,
    outWidth: 32,
    outHeight: 32,
    groups: [
      { id: 'roads', label: 'Roads' },
      { id: 'roads-labels', label: 'Roads labels' },
    ],
    outPath,
    attribution: null,
  }
}

async function feedLayered(session: ExportSession): Promise<void> {
  await session.addChunk('Roads', { col: 0, row: 0, png: await solidPng(0, 0, 255, 32) })
  await session.addChunk('Roads labels', { col: 0, row: 0, png: await solidPng(255, 0, 0, 32) })
}

describe('ExportSession layered mode', () => {
  it('assembles a psd with children ordered top-first over bottom→top group order', async () => {
    const outPath = join(dir, 'map.psd')
    const session = new ExportSession(layeredSpec('psd', outPath), () => {})

    await feedLayered(session)
    await session.finish()

    const psd = readPsd(await readFile(outPath), { useImageData: true })
    expect(psd.width).toBe(32)
    expect(psd.height).toBe(32)
    expect(psd.children).toHaveLength(2)
    expect(psd.children![0].name).toBe('Roads labels')
    expect(psd.children![1].name).toBe('Roads')

    const top = psd.children![0].imageData!
    const data = top.data as Uint8Array
    const i = (16 * 32 + 16) * 4
    expect(data[i]).toBeGreaterThan(data[i + 2])
  })

  it('writes slugified per-group PNG files into the png-folder directory', async () => {
    const outPath = join(dir, 'layers')
    await mkdir(outPath)
    const session = new ExportSession(layeredSpec('png-folder', outPath), () => {})

    await feedLayered(session)
    await session.finish()

    const roads = await stat(join(outPath, 'Roads.png'))
    const labels = await stat(join(outPath, 'Roads-labels.png'))
    expect(roads.isFile()).toBe(true)
    expect(labels.isFile()).toBe(true)

    const meta = await sharp(await readFile(join(outPath, 'Roads.png'))).metadata()
    expect(meta.width).toBe(32)
    expect(meta.height).toBe(32)
  })

  it('emits compositing per group, then assembling, then done', async () => {
    const outPath = join(dir, 'map.psd')
    const events: ExportProgress[] = []
    const session = new ExportSession(layeredSpec('psd', outPath), collector(events))

    await feedLayered(session)
    await session.finish()

    expect(events).toEqual([
      { stage: 'compositing', group: 'Roads', done: 1, total: 2 },
      { stage: 'compositing', group: 'Roads labels', done: 2, total: 2 },
      { stage: 'assembling' },
      { stage: 'done', path: outPath },
    ])
  })

  it('awaits an in-flight composite when finish arrives before the last addChunk settles', async () => {
    const outPath = join(dir, 'map.psd')
    const events: ExportProgress[] = []
    const session = new ExportSession(layeredSpec('psd', outPath), collector(events))

    await session.addChunk('Roads', { col: 0, row: 0, png: await solidPng(0, 0, 255, 32) })
    const lastChunk = session.addChunk('Roads labels', {
      col: 0,
      row: 0,
      png: await solidPng(255, 0, 0, 32),
    })
    await session.finish()
    await lastChunk

    expect(events).toEqual([
      { stage: 'compositing', group: 'Roads', done: 1, total: 2 },
      { stage: 'compositing', group: 'Roads labels', done: 2, total: 2 },
      { stage: 'assembling' },
      { stage: 'done', path: outPath },
    ])

    const psd = readPsd(await readFile(outPath), { useImageData: true })
    expect(psd.children![0].name).toBe('Roads labels')
    expect(psd.children![1].name).toBe('Roads')
  })

  it('reports an error and rejects finish when a group received zero chunks', async () => {
    const outPath = join(dir, 'map.psd')
    const events: ExportProgress[] = []
    const session = new ExportSession(layeredSpec('psd', outPath), collector(events))

    await expect(session.finish()).rejects.toThrow(/missing chunks/i)
    expect(events).toEqual([
      { stage: 'error', message: expect.stringMatching(/missing chunks/i) },
    ])
    await expect(stat(outPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ignores cancel, blocks further chunks and finish, and writes no files', async () => {
    const outPath = join(dir, 'map.psd')
    const events: ExportProgress[] = []
    const session = new ExportSession(layeredSpec('psd', outPath), collector(events))

    await feedLayered(session)
    const emittedBeforeCancel = events.length
    session.cancel()

    await expect(
      session.addChunk('Roads', { col: 0, row: 0, png: await solidPng(0, 0, 255, 32) })
    ).rejects.toThrow(/cancelled/i)
    await expect(session.finish()).rejects.toThrow(/cancelled/i)
    expect(events).toHaveLength(emittedBeforeCancel)
    await expect(stat(outPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('ExportSession attribution', () => {
  const ATTRIBUTION = '© OpenStreetMap contributors'

  function flatSpec(outPath: string, attribution: string | null): ExportJobSpec {
    return {
      mode: 'flat',
      container: 'png-folder',
      cols: 2,
      rows: 2,
      chunkPx: 64,
      actualWidth: 128,
      actualHeight: 128,
      outWidth: 128,
      outHeight: 128,
      groups: [],
      outPath,
      attribution,
    }
  }

  async function feedFlat(session: ExportSession): Promise<void> {
    for (const [col, row] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      await session.addChunk('Flat', { col, row, png: await solidPng(20, 40, 60) })
    }
  }

  it('flat: composites attribution into the bottom-right, leaving the rest untouched', async () => {
    const outPath = join(dir, 'map.png')
    const session = new ExportSession(flatSpec(outPath, ATTRIBUTION), () => {})

    await feedFlat(session)
    await session.finish()

    const { data, info } = await sharp(await readFile(outPath))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(128)
    expect(info.height).toBe(128)

    const pixelAt = (x: number, y: number): [number, number, number, number] => {
      const i = (y * info.width + x) * 4
      return [data[i], data[i + 1], data[i + 2], data[i + 3]]
    }

    expect(pixelAt(10, 10)).toEqual([20, 40, 60, 255])

    let altered = 0
    for (let y = 96; y < 126; y++) {
      for (let x = 20; x < 124; x++) {
        const [r, g, b] = pixelAt(x, y)
        if (r !== 20 || g !== 40 || b !== 60) altered++
      }
    }
    expect(altered).toBeGreaterThan(30)
  })

  it('flat: attribution null leaves the image uniform', async () => {
    const outPath = join(dir, 'map.png')
    const session = new ExportSession(flatSpec(outPath, null), () => {})

    await feedFlat(session)
    await session.finish()

    const { data, info } = await sharp(await readFile(outPath))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let altered = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 20 || data[i + 1] !== 40 || data[i + 2] !== 60) altered++
    }
    expect(info.width).toBe(128)
    expect(altered).toBe(0)
  })

  it('flat: composites attribution at square 16k past sharp default input pixel limit', async () => {
    const size = 16384
    const outPath = join(dir, 'map.png')
    const spec: ExportJobSpec = { ...flatSpec(outPath, ATTRIBUTION), chunkPx: size, actualWidth: size, actualHeight: size, outWidth: size, outHeight: size, cols: 1, rows: 1 }
    const session = new ExportSession(spec, () => {})
    const chunk = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
      limitInputPixels: false,
    })
      .png()
      .toBuffer()

    await session.addChunk('Flat', { col: 0, row: 0, png: chunk })
    await session.finish()

    const meta = await sharp(await readFile(outPath), { limitInputPixels: false }).metadata()
    expect(meta.width).toBe(size)
    expect(meta.height).toBe(size)
  }, 240_000)

  it('layered psd: attribution is appended as the topmost layer', async () => {
    const outPath = join(dir, 'map.psd')
    const spec: ExportJobSpec = { ...layeredSpec('psd', outPath), attribution: ATTRIBUTION }
    const session = new ExportSession(spec, () => {})

    await feedLayered(session)
    await session.finish()

    const psd = readPsd(await readFile(outPath), { useImageData: true })
    expect(psd.children).toHaveLength(3)
    expect(psd.children![0].name).toBe('Attribution')
    expect(psd.children![1].name).toBe('Roads labels')
    expect(psd.children![2].name).toBe('Roads')

    const attrData = psd.children![0].imageData!.data as Uint8Array
    let lit = 0
    for (let i = 3; i < attrData.length; i += 4) {
      if (attrData[i] > 0) lit++
    }
    expect(lit).toBeGreaterThan(0)
  })

  it('layered psd: attribution null adds no layer', async () => {
    const outPath = join(dir, 'map.psd')
    const session = new ExportSession(layeredSpec('psd', outPath), () => {})

    await feedLayered(session)
    await session.finish()

    const psd = readPsd(await readFile(outPath), { useImageData: true })
    expect(psd.children).toHaveLength(2)
    expect(psd.children!.map((child) => child.name)).not.toContain('Attribution')
  })

  it('png-folder: writes an extra Attribution.png when attribution is set', async () => {
    const outPath = join(dir, 'layers')
    await mkdir(outPath)
    const spec: ExportJobSpec = { ...layeredSpec('png-folder', outPath), attribution: ATTRIBUTION }
    const session = new ExportSession(spec, () => {})

    await feedLayered(session)
    await session.finish()

    const attrFile = await stat(join(outPath, 'Attribution.png'))
    expect(attrFile.isFile()).toBe(true)
    const meta = await sharp(await readFile(join(outPath, 'Attribution.png'))).metadata()
    expect(meta.width).toBe(32)
    expect(meta.height).toBe(32)

    const { data } = await sharp(await readFile(join(outPath, 'Attribution.png')))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let lit = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) lit++
    }
    expect(lit).toBeGreaterThan(0)
  })

  it('png-folder: attribution null writes no Attribution.png', async () => {
    const outPath = join(dir, 'layers')
    await mkdir(outPath)
    const session = new ExportSession(layeredSpec('png-folder', outPath), () => {})

    await feedLayered(session)
    await session.finish()

    await expect(stat(join(outPath, 'Attribution.png'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
