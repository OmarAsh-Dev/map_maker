import { isAbsolute } from 'node:path'

const MAX_DIM = 16384

function assertPositiveInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`export spec: ${name} must be a positive integer, got ${String(value)}`)
  }
  if (value > MAX_DIM) {
    throw new Error(`export spec: ${name} must be at most ${MAX_DIM}, got ${value}`)
  }
  return value
}

function assertUnion<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`export spec: ${name} must be one of ${allowed.join(' | ')}, got ${String(value)}`)
  }
  return value as T
}

export function validateExportSpec(spec: unknown): void {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error('export spec: expected an object')
  }
  const s = spec as Record<string, unknown>
  assertUnion(s.mode, ['flat', 'layered'] as const, 'mode')
  assertUnion(s.container, ['psd', 'png-folder'] as const, 'container')
  const cols = assertPositiveInt(s.cols, 'cols')
  const rows = assertPositiveInt(s.rows, 'rows')
  assertPositiveInt(s.chunkPx, 'chunkPx')
  assertPositiveInt(s.outWidth, 'outWidth')
  assertPositiveInt(s.outHeight, 'outHeight')
  if (cols * rows > MAX_DIM) {
    throw new Error(`export spec: cols*rows must be at most ${MAX_DIM}, got ${cols * rows}`)
  }
  if (!Array.isArray(s.groups)) {
    throw new Error('export spec: groups must be an array')
  }
  for (const group of s.groups) {
    if (typeof group !== 'object' || group === null) {
      throw new Error('export spec: each group must be an object with string id and label')
    }
    const g = group as Record<string, unknown>
    if (
      typeof g.id !== 'string' ||
      g.id.length === 0 ||
      typeof g.label !== 'string' ||
      g.label.length === 0
    ) {
      throw new Error('export spec: each group must have non-empty string id and label')
    }
  }
  if (typeof s.outPath !== 'string' || !isAbsolute(s.outPath)) {
    throw new Error(`export spec: outPath must be an absolute path, got ${String(s.outPath)}`)
  }
  if (s.attribution !== null && typeof s.attribution !== 'string') {
    throw new Error('export spec: attribution must be a string or null')
  }
}
