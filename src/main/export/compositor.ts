import sharp from 'sharp'

export interface CompositorChunk {
  col: number
  row: number
  png: Buffer
}

export async function compositeChunks(
  chunks: CompositorChunk[],
  cols: number,
  rows: number,
  chunkPx: number,
  outWidth: number,
  outHeight: number
): Promise<Buffer> {
  const gridWidth = Math.ceil(cols * chunkPx)
  const gridHeight = Math.ceil(rows * chunkPx)

  const base = sharp({
    create: { width: gridWidth, height: gridHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
  const composited = await (chunks.length > 0
    ? base.composite(
        chunks.map((chunk) => ({
          input: chunk.png,
          left: chunk.col * chunkPx,
          top: chunk.row * chunkPx,
        }))
      )
    : base
  )
    .png()
    .toBuffer()

  const cropWidth = Math.min(outWidth, gridWidth)
  const cropHeight = Math.min(outHeight, gridHeight)
  const cropped =
    cropWidth === gridWidth && cropHeight === gridHeight
      ? composited
      : await sharp(composited, { limitInputPixels: false })
          .extract({
            left: Math.floor((gridWidth - cropWidth) / 2),
            top: Math.floor((gridHeight - cropHeight) / 2),
            width: cropWidth,
            height: cropHeight,
          })
          .png()
          .toBuffer()

  if (cropWidth === outWidth && cropHeight === outHeight) {
    return cropped
  }

  return sharp({
    create: { width: outWidth, height: outHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: cropped,
        left: Math.floor((outWidth - cropWidth) / 2),
        top: Math.floor((outHeight - cropHeight) / 2),
      },
    ])
    .png()
    .toBuffer()
}
