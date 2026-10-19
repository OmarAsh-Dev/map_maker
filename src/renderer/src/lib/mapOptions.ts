import type { MapOptions } from 'maplibre-gl'

export function createMapOptions(container: HTMLElement, styleUrl: string): MapOptions {
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
