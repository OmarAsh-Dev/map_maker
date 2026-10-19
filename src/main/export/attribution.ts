import sharp from 'sharp'

export function renderAttributionPng(
  width: number,
  height: number,
  text: string
): Promise<Buffer> {
  const fontSize = Math.max(12, Math.round(width / 150))
  const margin = Math.max(4, Math.round(fontSize / 2))
  const strokeWidth = Math.max(1, Math.round(fontSize / 6))

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<text x="${width - margin}" y="${height - margin}" text-anchor="end"`,
    `font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}"`,
    `fill="#ffffff" stroke="#000000" stroke-width="${strokeWidth}"`,
    `stroke-linejoin="round" paint-order="stroke">`,
    escapeXml(text),
    `</text>`,
    `</svg>`,
  ].join(' ')

  return sharp(Buffer.from(svg), { limitInputPixels: false }).png().toBuffer()
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
