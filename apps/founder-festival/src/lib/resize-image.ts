// Client-only helper: downscale + re-encode an image to a web-friendly size
// BEFORE uploading it to Blob. Runs entirely in the browser (canvas), so the
// original full-resolution file (often 5-15MB straight off a phone) never leaves
// the device — we upload a ~web-sized JPEG instead. Best-effort: if the browser
// can't decode the file (e.g. HEIC outside Safari), we return the original
// unchanged so the upload still succeeds.

// Longest edge of the output, in px. 2048 is plenty for a full-bleed event photo
// while keeping files small. Re-encoded as JPEG at this quality.
const MAX_EDGE = 2048;
const QUALITY = 0.82;

export async function resizeImageForWeb(file: File): Promise<File> {
  if (typeof document === "undefined") return file; // SSR guard
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` bakes in EXIF orientation so portrait phone photos aren't
    // rotated sideways after re-encoding.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // undecodable (e.g. HEIC on Chrome) — upload as-is
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  // If the image was already small + well-compressed and we'd only make it
  // bigger without downscaling, keep the original.
  if (scale === 1 && blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
