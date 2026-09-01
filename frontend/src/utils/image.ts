/** Resize + re-encode an image so the upload stays well under any host's
 * request-body limit (e.g. Vercel Functions cap request bodies at 4.5MB,
 * with no way to raise it) -- a raw phone camera photo can easily be
 * several times that. Downscales to at most maxDimension on the longest
 * side and re-encodes as JPEG, backing off quality if still too large.
 */
export async function compressImage(
  source: Blob,
  { maxDimension = 1600, maxBytes = 3_500_000, initialQuality = 0.85 }: {
    maxDimension?: number
    maxBytes?: number
    initialQuality?: number
  } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = initialQuality
  for (let attempt = 0; attempt < 5; attempt++) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return source
    if (blob.size <= maxBytes || quality <= 0.4) return blob
    quality -= 0.15
  }
  return source
}
