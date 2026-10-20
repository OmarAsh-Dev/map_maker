import { describe, expect, it, vi } from 'vitest'
import { waitForMapEvent } from './chunkRenderer'

interface FakeMap {
  once(event: 'load' | 'idle', cb: () => void): unknown
  off(event: 'load' | 'idle', cb: () => void): unknown
  emit(event: 'load' | 'idle'): void
}

function createFakeMap(): FakeMap & { listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>()
  return {
    listeners,
    once(event, cb) {
      listeners.set(event, cb)
      return this
    },
    off(event) {
      listeners.delete(event)
      return this
    },
    emit(event) {
      listeners.get(event)?.()
    },
  }
}

describe('waitForMapEvent', () => {
  it('resolves when the event fires and detaches the listener', async () => {
    const map = createFakeMap()
    const promise = waitForMapEvent(map, 'idle')
    map.emit('idle')
    await expect(promise).resolves.toBeUndefined()
    expect(map.listeners.has('idle')).toBe(false)
  })

  it('rejects immediately on a pre-aborted signal', async () => {
    const map = createFakeMap()
    const controller = new AbortController()
    controller.abort()
    await expect(waitForMapEvent(map, 'idle', controller.signal)).rejects.toThrow(
      'Export cancelled'
    )
    expect(map.listeners.has('idle')).toBe(false)
  })

  it('rejects on abort while waiting and detaches the listener', async () => {
    const map = createFakeMap()
    const controller = new AbortController()
    const promise = waitForMapEvent(map, 'idle', controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow('Export cancelled')
    expect(map.listeners.has('idle')).toBe(false)
  })

  it('rejects on timeout and detaches the listener', async () => {
    vi.useFakeTimers()
    try {
      const map = createFakeMap()
      const promise = waitForMapEvent(map, 'load', undefined, 50)
      const assertion = expect(promise).rejects.toThrow(/did not fire 'load'/)
      vi.advanceTimersByTime(60)
      await assertion
      expect(map.listeners.has('load')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
