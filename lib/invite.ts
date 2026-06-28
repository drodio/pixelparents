// Shared (client + server) parsing for the co-parent invite email list. Lives
// outside the "use server" actions module so the client form can import it too
// (a "use server" file may only export async server actions).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Max co-parents invitable in a single submit — keeps an invite reasonable.
export const MAX_INVITES = 10;

// Parse a comma- (or whitespace-) separated list of emails into a clean, deduped,
// lowercased, validated set, capped at MAX_INVITES.
export function parseInviteEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(/[,\s]+/)) {
    const e = part.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= MAX_INVITES) break;
  }
  return out;
}
