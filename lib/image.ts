// Client-side image optimization: downscale to a max dimension and
// re-encode to WebP at a moderate quality so uploads stay small.
// Runs in the browser only (uses canvas / createImageBitmap).

export type OptimizedImage = {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
};

export async function optimizeImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality),
  );
  if (!blob) throw new Error("Image encoding failed");

  return { blob, width, height, contentType: "image/webp" };
}
