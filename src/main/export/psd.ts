import { initializeCanvas, writePsdBuffer, type Layer, type Psd } from 'ag-psd'
import { createCanvas } from 'canvas'
import sharp from 'sharp'

export interface PsdLayer {
  name: string
  png: Buffer
}

const MAX_PSD_DIMENSION = 30000

type PsdCanvas = NonNullable<Layer['canvas']>
type PsdImageData = NonNullable<Layer['imageData']>
type CreateImageDataResult = ReturnType<NonNullable<Parameters<typeof initializeCanvas>[1]>>

let canvasReady = false

function ensureCanvasInitialized(): void {
  if (canvasReady) return
  initializeCanvas(
    (width, height) => createCanvas(width, height) as unknown as PsdCanvas,
    (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }) as unknown as CreateImageDataResult
  )
  canvasReady = true
}

async function pngToImageData(png: Buffer, width: number, height: number): Promise<PsdImageData> {
  const { data, info } = await sharp(png, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = new Uint8ClampedArray(width * height * 4)
  const rows = Math.min(info.height, height)
  const rowBytes = Math.min(info.width, width) * 4
  for (let y = 0; y < rows; y++) {
    const src = y * info.width * 4
    pixels.set(data.subarray(src, src + rowBytes), y * width * 4)
  }
  return { width, height, data: pixels }
}

async function flattenLayers(layers: PsdLayer[], width: number, height: number): Promise<PsdImageData> {
  const base = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    limitInputPixels: false,
  })
  const flat = await (
    layers.length > 0
      ? base.composite(
          layers.map((layer) => ({
            input: layer.png,
            left: 0,
            top: 0,
            blend: 'over' as const,
            limitInputPixels: false,
          }))
        )
      : base
  )
    .ensureAlpha()
    .raw()
    .toBuffer()
  const bytes = width * height * 4
  const slice = flat.subarray(0, bytes)
  const data = new Uint8ClampedArray(slice.buffer, slice.byteOffset, slice.byteLength)
  return { width, height, data }
}

export async function assemblePsd(layers: PsdLayer[], width: number, height: number): Promise<Buffer> {
  ensureCanvasInitialized()

  const children: Layer[] = []
  for (const layer of layers) {
    children.push({
      name: layer.name,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      imageData: await pngToImageData(layer.png, width, height),
    })
  }

  const psd: Psd = {
    width,
    height,
    children: children.slice().reverse(),
    imageData: await flattenLayers(layers, width, height),
  }

  return writePsdBuffer(psd, {
    psb: width > MAX_PSD_DIMENSION || height > MAX_PSD_DIMENSION,
  })
}
