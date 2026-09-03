/**
 * Client-side image preprocessing before a photo is sent to any vision
 * provider: resize so the long edge is at most `maxDim`, and re-encode as
 * JPEG to keep the upload small. Runs entirely in the browser — the photo
 * never touches a server.
 */

/** Pure dimension math, kept separate from the Canvas/Image side effects below so it's unit-testable. */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function resizeAndCompressImage(
  blob: Blob,
  maxDim = 1024,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = computeResizedDimensions(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Failed to encode image as JPEG."))),
      "image/jpeg",
      quality,
    );
  });
}

/** Converts a Blob to a base64 string with no data-URL prefix, as the Anthropic/Ollama APIs expect. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}
