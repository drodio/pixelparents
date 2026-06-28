import { put } from "@vercel/blob";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

// Copy a remote image (e.g. a logo the admin picked from the icon-search grid)
// into our own Vercel Blob, so we never hot-link a third-party URL. Validates
// it's actually an image and within a sane size cap. Returns the public blob URL.
// Throws on any problem (caller maps to a 4xx/5xx).
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function storeImageFromUrl(pathPrefix: string, imageUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("invalid image URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("invalid image URL");
  }

  const res = await fetchWithTimeout(imageUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`could not fetch image (${res.status})`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) throw new Error("that URL is not an image");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty image");
  if (bytes.byteLength > MAX_BYTES) throw new Error("image too large (max 5MB)");

  const ext = contentType.slice("image/".length).replace(/[^a-z0-9]/gi, "") || "img";
  const blob = await put(`${pathPrefix}/searched.${ext}`, bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });
  return blob.url;
}
