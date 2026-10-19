import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { compositeChunks, type CompositorChunk } from './compositor'
import { assemblePsd } from './psd'

export interface ExportJobSpec {
  mode: 'flat' | 'layered'
  container: 'psd' | 'png-folder'
  cols: number
  rows: number
  chunkPx: number
  actualWidth: number
  actualHeight: number
  outWidth: number
  outHeight: number
  groups: { id: string; label: string }[]
  outPath: string
}

export type ExportProgress =
  | { stage: 'compositing'; group: string; done: number; total: number }
  | { stage: 'assembling' }
  | { stage: 'done'; path: string }
  | { stage: 'error'; message: string }

const FLAT_GROUP = 'Flat'

function slugify(label: string): string {
  const slug = label
    .trim()
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return slug.length > 0 ? slug : 'layer'
}

export class ExportSession {
  private readonly spec: ExportJobSpec
  private readonly onProgress: (p: ExportProgress) => void
  private readonly buckets = new Map<string, CompositorChunk[]>()
  private readonly composited = new Map<string, Buffer>()
  private readonly totalGroups: number
  private groupsDone = 0
  private cancelled = false
  private failureMessage: string | null = null
  private finished = false

  constructor(spec: ExportJobSpec, onProgress: (p: ExportProgress) => void) {
    this.spec = spec
    this.onProgress = onProgress
    this.totalGroups = spec.mode === 'flat' ? 1 : spec.groups.length
  }

  async addChunk(groupLabel: string, chunk: CompositorChunk): Promise<void> {
    this.assertUsable()
    const key = this.spec.mode === 'flat' ? FLAT_GROUP : groupLabel
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = []
      this.buckets.set(key, bucket)
    }
    bucket.push(chunk)

    if (bucket.length !== this.spec.cols * this.spec.rows) return

    try {
      const png = await compositeChunks(
        bucket,
        this.spec.cols,
        this.spec.rows,
        this.spec.chunkPx,
        this.spec.outWidth,
        this.spec.outHeight
      )
      if (this.cancelled) return
      this.composited.set(key, png)
      this.groupsDone++
      this.onProgress({
        stage: 'compositing',
        group: key,
        done: this.groupsDone,
        total: this.totalGroups,
      })
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err))
      throw new Error(this.failureMessage!)
    }
  }

  async finish(): Promise<void> {
    this.assertUsable()

    if (this.spec.mode === 'flat') {
      if (!this.composited.has(FLAT_GROUP)) {
        const received = this.buckets.get(FLAT_GROUP)?.length ?? 0
        this.fail(
          `Incomplete export: expected ${this.spec.cols * this.spec.rows} chunks, received ${received}`
        )
        throw new Error(this.failureMessage!)
      }
      this.onProgress({ stage: 'assembling' })
      await mkdir(dirname(this.spec.outPath), { recursive: true })
      await writeFile(this.spec.outPath, this.composited.get(FLAT_GROUP)!)
      this.finished = true
      this.onProgress({ stage: 'done', path: this.spec.outPath })
      return
    }

    for (const group of this.spec.groups) {
      if (!this.composited.has(group.label)) {
        this.fail(`Missing chunks for group "${group.label}"`)
        throw new Error(this.failureMessage!)
      }
    }

    this.onProgress({ stage: 'assembling' })

    if (this.spec.container === 'psd') {
      const layers = this.spec.groups.map((group) => ({
        name: group.label,
        png: this.composited.get(group.label)!,
      }))
      const buffer = await assemblePsd(layers, this.spec.outWidth, this.spec.outHeight)
      await mkdir(dirname(this.spec.outPath), { recursive: true })
      await writeFile(this.spec.outPath, buffer)
      this.finished = true
      this.onProgress({ stage: 'done', path: this.spec.outPath })
      return
    }

    await mkdir(this.spec.outPath, { recursive: true })
    for (const group of this.spec.groups) {
      await writeFile(
        join(this.spec.outPath, `${slugify(group.label)}.png`),
        this.composited.get(group.label)!
      )
    }
    this.finished = true
    this.onProgress({ stage: 'done', path: this.spec.outPath })
  }

  cancel(): void {
    this.cancelled = true
  }

  private assertUsable(): void {
    if (this.cancelled) throw new Error('Export cancelled')
    if (this.failureMessage) throw new Error(this.failureMessage)
    if (this.finished) throw new Error('Export already finished')
  }

  private fail(message: string): void {
    this.failureMessage = message
    this.onProgress({ stage: 'error', message })
  }
}
