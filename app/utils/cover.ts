/** Re-encode a cover image to WebP, capped at maxDim on the long edge. */
export async function toWebpCover(source: Blob, maxDim = 480): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  } catch {
    return null
  }
}
