// Shared (client + server) parsing for the co-parent invite email list. Lives
// outside the "use server" actions module so the client form can import it too
// (a "use server" file may only export async server actions).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Max co-parents invitable in a single submit — keeps an invite reasonable.
export const MAX_INVITES = 10;

// A signup may send at most this many co-parent invite emails over its lifetime.
// sendCoParentInvites is an unauthenticated outbound-email primitive (gated only
// by knowing the secret signup id), so this lifetime cap bounds it as an email
// relay / spam vector. A real family needs only a couple; 20 leaves headroom.
export const INVITE_LIFETIME_CAP = 20;

// How many invites to grant given the count already used and the count wanted.
// This is the SAME clamp the atomic reserve performs in SQL
// (`LEAST(cap, used + want) - used`); kept here as a pure, unit-tested mirror so
// the cap math is covered without a live DB.
export function grantedQuota(used: number, want: number, cap = INVITE_LIFETIME_CAP): number {
  const u = Math.max(0, used);
  const after = Math.min(cap, u + Math.max(0, want));
  return Math.max(0, after - u);
}

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
