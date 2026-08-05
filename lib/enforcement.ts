// Pure enforcement logic: what a restriction means, when it applies, and how a
// member's history reads at a glance.
//
// Kept free of DB/Next imports so it can be unit-tested directly. Whether
// someone is muted or banned decides if they can participate at all, so the
// rules should be provable rather than inferred from a query.

export const ENFORCEMENT_KINDS = ["mute", "ban", "delete", "note"] as const;
export type EnforcementKind = (typeof ENFORCEMENT_KINDS)[number];

// Offered durations. `null` = permanent.
export const DURATION_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Permanent", hours: null },
];

export type ActionLike = {
  kind: string;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt?: Date | string | null;
};

function toTime(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

// Is this action currently in force?
//
// An action is active when it is a restriction (mute/ban), has not been revoked,
// and either never expires or has not expired yet. Time-based rather than a
// stored "active" flag, so a lapsed mute frees itself with no job to run.
export function isActive(a: ActionLike, now: number = Date.now()): boolean {
  if (a.kind !== "mute" && a.kind !== "ban") return false;
  if (toTime(a.revokedAt) != null) return false;
  const exp = toTime(a.expiresAt);
  return exp == null || exp > now;
}

export type Restriction = {
  muted: boolean;
  banned: boolean;
  // When the strongest active restriction lifts; null = permanent.
  until: Date | null;
  reason: string | null;
};

// Collapse a member's whole history into "what applies right now".
//
// A ban implies a mute — someone with no platform access certainly can't post —
// so callers only need to check `banned` for access and `muted` for posting.
export function activeRestriction(
  actions: (ActionLike & { reason?: string | null })[],
  now: number = Date.now(),
): Restriction {
  const live = actions.filter((a) => isActive(a, now));
  const ban = live.find((a) => a.kind === "ban");
  const mute = live.find((a) => a.kind === "mute");
  const strongest = ban ?? mute ?? null;
  return {
    muted: Boolean(ban || mute),
    banned: Boolean(ban),
    until: strongest ? (toTime(strongest.expiresAt) == null ? null : new Date(toTime(strongest.expiresAt)!)) : null,
    reason: strongest?.reason ?? null,
  };
}

// Compact history for the admin user list, e.g.
//   "banned permanently" / "muted 23h left · 2x mute · 3x delete"
//
// Leads with what is CURRENTLY in force (that's the decision-relevant bit), then
// the lifetime tallies that reveal a repeat offender.
export function summarizeHistory(
  actions: (ActionLike & { reason?: string | null })[],
  now: number = Date.now(),
): string {
  if (actions.length === 0) return "—";
  const parts: string[] = [];
  const r = activeRestriction(actions, now);

  if (r.banned) {
    parts.push(r.until ? `banned until ${r.until.toISOString().slice(0, 10)}` : "banned permanently");
  } else if (r.muted) {
    parts.push(r.until ? `muted until ${r.until.toISOString().slice(0, 10)}` : "muted permanently");
  }

  const tally = (k: EnforcementKind) => actions.filter((a) => a.kind === k).length;
  for (const k of ["mute", "ban", "delete"] as const) {
    const n = tally(k);
    if (n > 0) parts.push(`${n}x ${k}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

// Turn a chosen duration into a concrete expiry. null hours = permanent.
export function expiryFromHours(hours: number | null, now: number = Date.now()): Date | null {
  return hours == null ? null : new Date(now + hours * 3_600_000);
}

export function coerceKind(v: unknown): EnforcementKind | null {
  return ENFORCEMENT_KINDS.includes(v as EnforcementKind) ? (v as EnforcementKind) : null;
}
