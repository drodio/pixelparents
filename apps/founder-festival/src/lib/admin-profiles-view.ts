import { clerkClient } from "@clerk/nextjs/server";
import type { ScoredProfileRow } from "@/lib/profiles-scored";

// View helpers shared by the admin profiles pages (the full list and the
// single-run /admin/profiles/[jobId] view) so their serialization can't drift.

// "San Mateo, CA, US" from the requester geo; null when nothing was captured.
export function fmtLocation(p: ScoredProfileRow): string | null {
  const parts = [p.requestCity, p.requestRegion, p.requestCountry].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// The SUBJECT's own location ("Austin, TX, USA"); null when none is known.
export function fmtSubjectLocation(p: ScoredProfileRow): string | null {
  const parts = [p.subjectCity, p.subjectRegion, p.subjectCountry].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Resolve claimer clerk ids → ALL their email addresses (primary first) in ONE
// batched Clerk Backend API call (avoids N+1). Returns a map; ids that fail to
// resolve are simply absent. The list is comma-joined for the admin Email column.
export async function resolveEmails(clerkUserIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (clerkUserIds.length === 0) return out;
  try {
    const clerk = await clerkClient();
    const res = await clerk.users.getUserList({ userId: clerkUserIds, limit: clerkUserIds.length });
    for (const u of res.data) {
      // Primary email first, then the rest, de-duped. Skip users with none.
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress;
      const emails = [
        ...(primary ? [primary] : []),
        ...u.emailAddresses.map((e) => e.emailAddress).filter((e) => e && e !== primary),
      ];
      if (emails.length > 0) out.set(u.id, emails);
    }
  } catch {
    // Leave unresolved; the UI still shows the profile as Claimed (no addresses).
  }
  return out;
}

// Resolve claimer clerk ids → their primary phone number (verified at claim
// time), in ONE batched Clerk call. Parallel to resolveEmails. ids that fail to
// resolve (or have no phone) are absent.
export async function resolvePhones(clerkUserIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (clerkUserIds.length === 0) return out;
  try {
    const clerk = await clerkClient();
    const res = await clerk.users.getUserList({ userId: clerkUserIds, limit: clerkUserIds.length });
    for (const u of res.data) {
      const primary =
        u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId)?.phoneNumber ??
        u.phoneNumbers[0]?.phoneNumber;
      if (primary) out.set(u.id, primary);
    }
  } catch {
    // Leave unresolved; the operator-provided phone (if any) still shows.
  }
  return out;
}

// Phone shown in the admin table / CSV: the claimer's Clerk-verified phone when
// claimed, else the operator/CSV-provided phone ("provided"). Pure; the page
// does the batched Clerk lookup and passes the map in.
export type PhoneStatus = "verified" | "provided";
export type ProfilePhoneInfo = { phone: string | null; phoneStatus: PhoneStatus | null };
export function profilePhoneInfo(
  p: { claimerClerkUserId: string | null; phone?: string | null },
  phonesById: Map<string, string>,
): ProfilePhoneInfo {
  if (p.claimerClerkUserId) {
    const clerkPhone = phonesById.get(p.claimerClerkUserId);
    if (clerkPhone) return { phone: clerkPhone, phoneStatus: "verified" };
  }
  if (p.phone) return { phone: p.phone, phoneStatus: "provided" };
  return { phone: null, phoneStatus: null };
}

// Email-verification provenance shown in the admin table's Email Status column:
// a claimer's address is "verified" (they proved ownership by claiming);
// an address discovered by an enrichment tool (AnyMailFinder) is "unverified".
export type EmailStatus = "verified" | "unverified";
export type EmailEntry = { email: string; status: EmailStatus };

export type ProfileEmailInfo = {
  claimed: boolean;
  emails: string | null; // comma-joined addresses (verified first), or null
  emailStatus: EmailStatus | null; // status of the primary (first) email
  list: EmailEntry[]; // ALL emails, verified-first — powers the CSV Email N pairs
};

// Derive the admin table's User / Email cells for one profile. Pure (no I/O) so
// it's unit-testable; the page does the batched Clerk lookup and passes the
// resolved map in. Combines, verified-first + de-duped:
//   - the claimer's Clerk address(es) → "verified" (they proved ownership), and
//   - the profile_emails rows (operator → "verified", anymailfinder → "unverified").
export function profileEmailInfo(
  p: {
    claimerClerkUserId: string | null;
    emails?: { email: string; status: EmailStatus; source: string }[];
  },
  emailsById: Map<string, string[]>,
): ProfileEmailInfo {
  const entries: EmailEntry[] = [];
  const seen = new Set<string>();
  const add = (email: string, status: EmailStatus) => {
    const k = email.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    entries.push({ email: k, status });
  };
  if (p.claimerClerkUserId) {
    for (const e of emailsById.get(p.claimerClerkUserId) ?? []) add(e, "verified");
  }
  for (const m of p.emails ?? []) add(m.email, m.status);
  // Stable verified-first ordering (claimer + operator before anymailfinder).
  entries.sort((a, b) => (a.status === "verified" ? 0 : 1) - (b.status === "verified" ? 0 : 1));

  const claimed = !!p.claimerClerkUserId;
  return {
    claimed,
    emails: entries.length > 0 ? entries.map((e) => e.email).join(", ") : null,
    // A claimed profile is "verified" even if Clerk returned no address string.
    emailStatus: entries[0]?.status ?? (claimed ? "verified" : null),
    list: entries,
  };
}
