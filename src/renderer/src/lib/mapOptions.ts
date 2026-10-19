import { setMaxParallelImageRequests } from 'maplibre-gl'
import type { MapOptions } from 'maplibre-gl'

export const MAX_PARALLEL_REQUESTS = 4

export function applyRequestCaps(): void {
  setMaxParallelImageRequests(MAX_PARALLEL_REQUESTS)
}

export function createMapOptions(container: HTMLElement, styleUrl: string): MapOptions {
  applyRequestCaps()
  const options = {
    container,
    style: styleUrl,
    pitch: 0,
    maxPitch: 0,
    renderWorldCopies: false,
    attributionControl: false as const,
    preserveDrawingBuffer: true,
    canvasContextAttributes: { preserveDrawingBuffer: true }
  }
  return options
}
