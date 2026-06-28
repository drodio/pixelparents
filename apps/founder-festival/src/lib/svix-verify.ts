import crypto from "node:crypto";

// Verify a Svix-signed webhook (Resend uses Svix) without the svix dependency.
// The signing secret looks like "whsec_<base64>". The signed content is
// `${id}.${timestamp}.${rawBody}`, HMAC-SHA256'd with the decoded secret; the
// `svix-signature` header carries one-or-more space-separated `v1,<base64sig>`
// entries (a secret rotation may list several). Returns true if any matches and
// the timestamp is within tolerance.
export function verifySvix(opts: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  toleranceSeconds?: number;
  nowSeconds: number; // pass Date.now()/1000 from the caller (no clock in libs)
}): boolean {
  const { secret, id, timestamp, signatureHeader, rawBody } = opts;
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const tol = opts.toleranceSeconds ?? 300;
  if (Math.abs(opts.nowSeconds - ts) > tol) return false;

  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBuf: Buffer;
  try {
    keyBuf = Buffer.from(key, "base64");
  } catch {
    return false;
  }
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBuf).update(signedContent).digest("base64");

  for (const part of signatureHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    try {
      const a = Buffer.from(sig, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    } catch {
      // try next entry
    }
  }
  return false;
}
