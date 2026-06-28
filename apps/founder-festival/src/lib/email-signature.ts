import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { renderSignatureHtml } from "@/lib/email-render";

// Re-exported so existing importers keep a stable path; the implementation lives
// in the DB-free @/lib/email-render so client components can use it too.
export { renderSignatureHtml };

// The email signature is a single editable super-admin setting ("Email options").
// It's stored as PLAIN TEXT (what the admin types in the box) and rendered to
// HTML at send time. This default is the text DROdio specified; the admin can
// override it on /admin/email-options.
export const EMAIL_SIGNATURE_KEY = "email_signature";

export const DEFAULT_EMAIL_SIGNATURE = `#Velocity,

DROdio

Your Festival Ringmaster
DROdio@Festival.so
+1.202.250.3846 (text me anytime)`;

// Tiny in-process cache so a burst of emails (e.g. a batch of decisions) does a
// single DB read, not one per message. A super-admin's save updates this
// instance's cache immediately; other serverless instances pick it up within the
// TTL. Errors are cached as the default too, so a missing table never re-queries
// on every send.
let _cache: { text: string; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

// Read the current signature text, falling back to the default when unset or on
// any DB error (so a missing row / table never breaks an email send).
export async function getEmailSignatureText(): Promise<string> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.text;
  let text = DEFAULT_EMAIL_SIGNATURE;
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, EMAIL_SIGNATURE_KEY))
      .limit(1);
    const v = row?.value;
    if (v && v.trim().length > 0) text = v;
  } catch {
    text = DEFAULT_EMAIL_SIGNATURE;
  }
  _cache = { text, at: Date.now() };
  return text;
}

// Persist a new signature (super-admin only — gated at the API route).
export async function setEmailSignatureText(value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: EMAIL_SIGNATURE_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
  // Refresh this instance's cache so the next send uses the new signature.
  _cache = { text: value.trim().length > 0 ? value : DEFAULT_EMAIL_SIGNATURE, at: Date.now() };
}

// The signature as ready-to-inject HTML for the email send layer.
export async function getRenderedEmailSignature(): Promise<string> {
  return renderSignatureHtml(await getEmailSignatureText());
}
