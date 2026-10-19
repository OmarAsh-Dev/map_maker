import { initializeCanvas, writePsdBuffer, type Layer, type Psd } from 'ag-psd'
import { createCanvas } from 'canvas'
import sharp from 'sharp'

export interface PsdLayer {
  name: string
  png: Buffer
}

const MAX_PSD_DIMENSION = 30000

type PsdCanvas = NonNullable<Layer['canvas']>

let canvasReady = false

function ensureCanvasInitialized(): void {
  if (canvasReady) return
  initializeCanvas((width, height) => createCanvas(width, height) as unknown as PsdCanvas)
  canvasReady = true
}

async function pngToCanvas(png: Buffer, width: number, height: number): Promise<PsdCanvas> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const canvas = createCanvas(width, height) as unknown as PsdCanvas
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  const rows = Math.min(info.height, height)
  for (let y = 0; y < rows; y++) {
    const src = y * info.width * 4
    imageData.data.set(data.subarray(src, src + Math.min(info.width, width) * 4), y * width * 4)
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

async function flattenLayers(layers: PsdLayer[], width: number, height: number): Promise<PsdCanvas> {
  const base = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
  const flat = await (
    layers.length > 0
      ? base.composite(layers.map((layer) => ({ input: layer.png, left: 0, top: 0, blend: 'over' as const })))
      : base
  )
    .ensureAlpha()
    .raw()
    .toBuffer()
  const canvas = createCanvas(width, height) as unknown as PsdCanvas
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  imageData.data.set(flat.subarray(0, width * height * 4))
  ctx.putImageData(imageData, 0, 0)
  return canvas
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
      canvas: await pngToCanvas(layer.png, width, height),
    })
  }

  const psd: Psd = {
    width,
    height,
    children: children.slice().reverse(),
    canvas: await flattenLayers(layers, width, height),
  }

  return writePsdBuffer(psd, {
    psb: width > MAX_PSD_DIMENSION || height > MAX_PSD_DIMENSION,
  })
}
