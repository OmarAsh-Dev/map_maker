import sharp from 'sharp'

export interface CompositorChunk {
  col: number
  row: number
  png: Buffer
}

function pasteOffset(start: number, region: number, chunkPx: number): number {
  const visible = Math.min(chunkPx, region - start)
  return Math.round(start + visible / 2 - chunkPx / 2)
}

export async function compositeChunks(
  chunks: CompositorChunk[],
  cols: number,
  rows: number,
  chunkPx: number,
  outWidth: number,
  outHeight: number
): Promise<Buffer> {
  const gridWidth = cols * chunkPx
  const gridHeight = rows * chunkPx
  if (outWidth > gridWidth || outHeight > gridHeight) {
    throw new Error(
      `compositeChunks: requested ${outWidth}x${outHeight} exceeds the ${gridWidth}x${gridHeight} chunk grid`
    )
  }

  const base = sharp({
    create: { width: gridWidth, height: gridHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    limitInputPixels: false,
  })
  const composited = await (chunks.length > 0
    ? base.composite(
        chunks.map((chunk) => ({
          input: chunk.png,
          left: pasteOffset(chunk.col * chunkPx, outWidth, chunkPx),
          top: pasteOffset(chunk.row * chunkPx, outHeight, chunkPx),
          limitInputPixels: false,
        }))
      )
    : base
  )
    .png()
    .toBuffer()

  if (outWidth === gridWidth && outHeight === gridHeight) {
    return composited
  }

  return sharp(composited, { limitInputPixels: false })
    .extract({ left: 0, top: 0, width: outWidth, height: outHeight })
    .png()
    .toBuffer()
}
