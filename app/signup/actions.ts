"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { checkBotId } from "botid/server";
import { getDb, getSql } from "@/lib/db";
import { signups, families, type Photo } from "@/lib/db/schema/signups";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  US_STATES,
  COUNTRIES,
  BUILDER_INTEREST,
  ACCOUNT_TYPE,
} from "@/lib/options";
import { signupSchema, linkedinUrlFromHandle } from "@/lib/validation";
import { generateShareToken } from "@/lib/share";
import {
  notifyNewSignup,
  notifyApplicantWelcome,
  notifyCoParentInvite,
  notifyAdminsVerifyProfile,
} from "@/lib/email";
import { getAdminRecipients } from "@/lib/admin";
import { createFamily, getFamilyByInviteToken, joinUrlFor } from "@/lib/family";
import { parseInviteEmails, INVITE_LIFETIME_CAP } from "@/lib/invite";
import { sanitizeRefToken } from "@/lib/referral";
import { canonicalizeAgainstPool } from "@/lib/interests";
import { normalizeWebsiteUrl } from "@/lib/enrichment/profile";
import { runEnrichmentForSignup } from "@/lib/db/enrichment-trigger";
import { after } from "next/server";

export type SignupState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Auto-save (draft signup row + per-field patch) ---------------------------

// Create the draft row on first interaction. BotID runs here once; subsequent
// patches skip it. Required columns are NOT NULL, so we seed empty strings.
// Every signup gets its own brand-new family (a co-parent joining via an invite
// link uses createCoParentDraft instead, which reuses an existing family).
export async function createDraftSignup(
  refToken?: string,
): Promise<{ id: string } | { error: string }> {
  const v = await checkBotId();
  if (v.isBot) return { error: "blocked" };
  try {
    const family = await createFamily();
    // Optional referral attribution: if this signup arrived via a family/student
    // "spread the word" link, stamp the (sanitized) referrer token into `extra`
    // for future credit. Opaque provenance only — no PII, no access granted.
    const ref = sanitizeRefToken(refToken);
    const [row] = await getDb()
      .insert(signups)
      .values({
        familyId: family.id,
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        githubUsername: "",
        ...(ref ? { extra: { referredBy: ref } } : {}),
      })
      .returning({ id: signups.id });
    return { id: row.id };
  } catch (err) {
    console.error("createDraftSignup failed:", err);
    return { error: "failed" };
  }
}

// Co-parent join flow: given a family invite token, create a NEW draft signup
// attached to that EXISTING family (rather than minting a fresh family). The
// invitee then fills out their own step-1 form and lands on their own thanks
// page, where the family's shared children already appear.
export async function createCoParentDraft(
  inviteToken: string,
): Promise<{ id: string } | { error: string }> {
  const v = await checkBotId();
  if (v.isBot) return { error: "blocked" };
  try {
    const family = await getFamilyByInviteToken(inviteToken);
    if (!family) return { error: "invalid-token" };
    const [row] = await getDb()
      .insert(signups)
      .values({
        familyId: family.id,
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        githubUsername: "",
      })
      .returning({ id: signups.id });
    return { id: row.id };
  } catch (err) {
    console.error("createCoParentDraft failed:", err);
    return { error: "failed" };
  }
}

const oneOf = (allowed: readonly string[], v: unknown): string | null =>
  typeof v === "string" && allowed.includes(v) ? v : null;
const text = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export type SignupPatch = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  githubUsername: string;
  ohsAffiliation: string;
  technicalDepth: string;
  linkedinHandle: string;
  skillsets: string[];
  timeCommitment: string;
  city: string;
  state: string;
  country: string;
  parentInterests: string[];
  photos: Photo[];
  builderInterest: string;
  // Opt-in to being a resource for OHS students (shown when LinkedIn is filled).
  studentResourceOptIn: boolean;
  // Who is signing up: "parent" (default) or "student". A student account must
  // link a parent/guardian (see the thanks-page parent-invite step). Stored in
  // extra.accountType; only "student" is persisted (parent is the absence of it,
  // matching pre-existing parent rows).
  accountType: string;
  // Personal/company website URL (NEW optional field — mirrors LinkedIn/GitHub).
  // Stored in extra.websiteUrl (jsonb, no schema drift); normalized to a safe
  // http(s) URL or cleared. Shown as a link on the profile next to LinkedIn/GitHub.
  websiteUrl: string;
  // Opt-in: build my profile automatically from public data. DEFAULT OFF; stored
  // in extra.enrichmentOptIn. Enrichment only runs when this is true.
  enrichmentOptIn: boolean;
}>;

// Translate a (trusted-but-untyped) SignupPatch into a sanitized Drizzle `set`
// object: each field is trimmed/length-capped and enum fields are membership-
// checked, so a client can never write an out-of-range value or an unexpected
// column. Shared by patchSignup AND patchFamilyMember so the two can't drift —
// they differ ONLY in the WHERE clause (own-UUID vs. family-scoped) that
// authorizes the write. `rowId` is the row whose `extra` jsonb is read for the
// builderInterest / studentResourceOptIn read-modify-write merge (so we don't
// clobber sibling keys like `notified`); it must be the row about to be UPDATEd.
export async function sanitizeSignupPatch(
  rowId: string,
  patch: SignupPatch,
): Promise<Record<string, unknown>> {
  const set: Record<string, unknown> = {};
  if ("firstName" in patch) set.firstName = text(patch.firstName, 100);
  if ("lastName" in patch) set.lastName = text(patch.lastName, 100);
  if ("email" in patch) set.email = text(patch.email, 200);
  if ("phone" in patch) set.phone = text(patch.phone, 40);
  if ("githubUsername" in patch) set.githubUsername = text(patch.githubUsername, 39);
  if ("ohsAffiliation" in patch) set.ohsAffiliation = oneOf(OHS_AFFILIATIONS, patch.ohsAffiliation);
  if ("technicalDepth" in patch) set.technicalDepth = oneOf(TECHNICAL_DEPTH, patch.technicalDepth);
  if ("timeCommitment" in patch) set.timeCommitment = oneOf(TIME_COMMITMENT, patch.timeCommitment);
  if ("linkedinHandle" in patch) set.linkedinUrl = linkedinUrlFromHandle(patch.linkedinHandle);
  if ("city" in patch) set.city = text(patch.city, 120) || null;
  if ("state" in patch) set.state = oneOf(US_STATES, patch.state);
  if ("country" in patch) set.country = oneOf(COUNTRIES, patch.country);
  if ("skillsets" in patch) {
    const s = (patch.skillsets ?? []).filter((x) => SKILLSETS.includes(x as never));
    set.skillsets = s.length ? s : null;
  }
  if ("parentInterests" in patch) {
    const s = (patch.parentInterests ?? [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    // Fold onto whatever spelling is already in the pool (case-insensitive) so we
    // don't add a capitalization variant of an existing interest. Brand-new
    // interests racing in two casings can still both land; the pool collapses
    // them for display and the scrub script reconciles the rows.
    set.parentInterests = s.length ? await canonicalizeAgainstPool(s) : null;
  }
  if ("photos" in patch && Array.isArray(patch.photos)) {
    set.photos = patch.photos
      .filter((p) => p && typeof p.url === "string" && typeof p.pathname === "string")
      .slice(0, 200);
  }
  // Keys stored in the reserved `extra` jsonb blob. Merge via read-modify-write
  // so we don't clobber other keys (e.g. `notified`).
  const extraPatch: Record<string, unknown> = {};
  if ("builderInterest" in patch) {
    extraPatch.builderInterest = oneOf(BUILDER_INTEREST, patch.builderInterest);
  }
  if ("studentResourceOptIn" in patch) {
    extraPatch.studentResourceOptIn = patch.studentResourceOptIn === true;
  }
  // Personal website — normalized to a safe http(s) URL (or removed when blank).
  if ("websiteUrl" in patch) {
    const url = normalizeWebsiteUrl(patch.websiteUrl);
    extraPatch.websiteUrl = url ?? undefined;
  }
  // Enrichment opt-in — only `true` opts in; anything else clears the key (OFF).
  if ("enrichmentOptIn" in patch) {
    extraPatch.enrichmentOptIn = patch.enrichmentOptIn === true ? true : undefined;
  }
  // Account type: only "student" is persisted. A "parent" account (or any
  // unrecognized value) clears the key entirely, so parent rows carry NO
  // accountType — byte-for-byte identical to the pre-existing parent shape.
  if ("accountType" in patch) {
    const t = oneOf(ACCOUNT_TYPE, patch.accountType);
    extraPatch.accountType = t === "student" ? "student" : undefined;
  }
  if (Object.keys(extraPatch).length > 0) {
    const [cur] = await getDb()
      .select({ extra: signups.extra })
      .from(signups)
      .where(eq(signups.id, rowId))
      .limit(1);
    const extra = (cur?.extra ?? {}) as Record<string, unknown>;
    const merged = { ...extra, ...extraPatch };
    // An explicit `undefined` in extraPatch means "remove this key" (e.g. a
    // parent account clearing a stale accountType) — drop it so the stored jsonb
    // doesn't carry a null/undefined remnant.
    for (const k of Object.keys(extraPatch)) {
      if (extraPatch[k] === undefined) delete merged[k];
    }
    set.extra = merged;
  }
  return set;
}

// Patch only the provided columns on an existing (draft or saved) signup row.
// Sanitizes each field; enum fields are membership-checked. No bot re-check.
//
// NOTE: this authorizes by UUID alone (anyone holding the row's id may write it)
// — fine for the signup/thanks self-edit + admin flows that already gate access
// upstream, but NOT for cross-account family editing. The /family hub uses
// patchFamilyMember instead, which derives the caller from the session and scopes
// the write to the caller's family. Keep the sanitizer shared (sanitizeSignupPatch).
export async function patchSignup(id: string, patch: SignupPatch): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(id)) return { ok: false };
  const set = await sanitizeSignupPatch(id, patch);
  if (Object.keys(set).length === 0) return { ok: true };
  try {
    await getDb().update(signups).set(set).where(eq(signups.id, id));
    return { ok: true };
  } catch (err) {
    console.error("patchSignup failed:", err);
    return { ok: false };
  }
}

// Called when the user clicks "Continue →". Validates the required fields and
// sends the DROdio notification exactly once (tracked in extra.notified).
export async function completeSignup(id: string): Promise<SignupState> {
  if (!UUID_RE.test(id)) return { ok: false, message: "We couldn't find your signup." };
  const [row] = await getDb().select().from(signups).where(eq(signups.id, id)).limit(1);
  if (!row) return { ok: false, message: "We couldn't find your signup." };

  const parsed = signupSchema.safeParse({
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    githubUsername: row.githubUsername,
    ohsAffiliation: row.ohsAffiliation ?? "",
    technicalDepth: row.technicalDepth ?? "",
    linkedinHandle: "",
    skillsets: row.skillsets ?? [],
    timeCommitment: row.timeCommitment ?? "",
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
  }

  const extra = (row.extra ?? {}) as Record<string, unknown>;
  if (!BUILDER_INTEREST.includes(extra.builderInterest as never)) {
    errors.builderInterest = "Please choose an option";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (!extra.notified) {
    await notifyNewSignup({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      githubUsername: row.githubUsername,
      ohsAffiliation: row.ohsAffiliation,
      technicalDepth: row.technicalDepth,
      linkedinUrl: row.linkedinUrl,
      skillsets: row.skillsets,
      timeCommitment: row.timeCommitment,
    });
    // Welcome the applicant + point them at step 2 (best-effort, never blocks).
    await notifyApplicantWelcome({ to: row.email, firstName: row.firstName, id: row.id });
    // Default a newly-completed profile to OHS-directory visible (they can switch
    // to "Just me" on the thanks page). Mirrors setShareVisibility("ohs").
    // Seed approvalStatus=pending here, BEFORE emailing admins — otherwise an
    // admin who acts on an early email (the fan-out below awaits per recipient)
    // could have their decision clobbered by this wholesale `extra` write.
    await getDb()
      .update(signups)
      .set({
        extra: { ...extra, notified: true, approvalStatus: extra.approvalStatus ?? "pending" },
        shareEnabled: true,
        shareVisibility: "ohs",
        shareToken: row.shareToken ?? generateShareToken(),
      })
      .where(eq(signups.id, id));
    // Email every admin to verify this profile's OHS-directory access. The first
    // admin to act resolves it for everyone (see lib/approval). Best-effort.
    try {
      const recipients = await getAdminRecipients();
      await notifyAdminsVerifyProfile({
        applicant: { id: row.id, firstName: row.firstName, lastName: row.lastName },
        admins: recipients,
      });
    } catch (err) {
      console.error("notifyAdminsVerifyProfile failed:", err);
    }
  }

  // Build the member's profile from public data in the BACKGROUND (after the
  // response is sent) — but ONLY if they opted in. The trigger self-gates on the
  // opt-in flag + available inputs + a rate limit, so scheduling it
  // unconditionally is safe and a no-op when the member didn't opt in.
  after(async () => {
    try {
      await runEnrichmentForSignup(id);
    } catch (err) {
      console.error("background enrichment (completeSignup) failed:", err);
    }
  });

  return { ok: true };
}

export async function submitSignup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const verification = await checkBotId();
  if (verification.isBot) {
    return { ok: false, message: "Submission blocked — please try again." };
  }

  const raw = {
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    githubUsername: formData.get("githubUsername") ?? "",
    ohsAffiliation: formData.get("ohsAffiliation") ?? "",
    technicalDepth: formData.get("technicalDepth") ?? "",
    linkedinHandle: formData.get("linkedinHandle") ?? "",
    skillsets: formData.getAll("skillsets"),
    timeCommitment: formData.get("timeCommitment") ?? "",
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  const data = parsed.data;
  const linkedinUrl = linkedinUrlFromHandle(data.linkedinHandle);
  const skillsets = data.skillsets?.length ? data.skillsets : null;

  let id: string;
  try {
    const family = await createFamily();
    const [row] = await getDb()
      .insert(signups)
      .values({
        familyId: family.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        githubUsername: data.githubUsername,
        ohsAffiliation: data.ohsAffiliation || null,
        technicalDepth: data.technicalDepth || null,
        linkedinUrl,
        skillsets,
        timeCommitment: data.timeCommitment || null,
      })
      .returning({ id: signups.id });
    id = row.id;
  } catch (err) {
    console.error("Signup insert failed:", err);
    return {
      ok: false,
      message: "Something went wrong saving your signup. Please try again.",
    };
  }

  await notifyNewSignup({
    id,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    githubUsername: data.githubUsername,
    ohsAffiliation: data.ohsAffiliation || null,
    technicalDepth: data.technicalDepth || null,
    linkedinUrl,
    skillsets,
    timeCommitment: data.timeCommitment || null,
  });

  // Welcome the applicant + point them at step 2 (best-effort, never blocks).
  await notifyApplicantWelcome({ to: data.email, firstName: data.firstName, id });

  redirect(`/signup/thanks?id=${id}`);
}

// --- Co-parent invites --------------------------------------------------------

// Atomically reserve up to `want` invites against a signup's lifetime cap and
// return how many were granted (0 if already at the cap). The reserve is a
// single UPDATE with a `FOR UPDATE` row lock, so concurrent calls serialize on
// the row and cannot race past the cap. We count ATTEMPTS (not just successful
// sends) toward the cap — that's what actually bounds outbound relay volume.
//
// The granted count is `LEAST(cap, used+want) - used`. That clamp is the
// canonical spec captured by the pure, unit-tested `grantedQuota()` in
// lib/invite.ts — keep the SQL below and that helper in lockstep (they must
// agree for the same inputs).
async function reserveInviteQuota(signupId: string, want: number): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    WITH locked AS (
      SELECT id, COALESCE((extra->>'coParentInvitesSent')::int, 0) AS used
      FROM signups WHERE id = ${signupId} FOR UPDATE
    )
    UPDATE signups s
    SET extra = jsonb_set(
          COALESCE(s.extra, '{}'::jsonb),
          '{coParentInvitesSent}',
          to_jsonb(LEAST(${INVITE_LIFETIME_CAP}, locked.used + ${want}))
        )
    FROM locked
    WHERE s.id = locked.id
    RETURNING locked.used AS used_before,
              LEAST(${INVITE_LIFETIME_CAP}, locked.used + ${want}) AS used_after
  `) as Array<{ used_before: number; used_after: number }>;
  if (rows.length === 0) return 0;
  // Mirrors grantedQuota(used_before, want): used_after - used_before.
  return Math.max(0, Number(rows[0].used_after) - Number(rows[0].used_before));
}

// Invite one or more co-parents (spouse / other parent[s]) to this signup's
// family. Each gets a secret join link tied to the family's invite token; on
// open they create their OWN parent row attached to the same family (and thus
// the same shared children). Best-effort emails: never throws to the caller.
// `requested` lets the UI message a partial send when the lifetime cap trims it.
export async function sendCoParentInvites(
  signupId: string,
  emailsInput: string[] | string,
): Promise<{ ok: boolean; sent: number; requested: number; reserved?: number; error?: string }> {
  if (!UUID_RE.test(signupId)) return { ok: false, sent: 0, requested: 0, error: "bad-id" };

  const raw = Array.isArray(emailsInput) ? emailsInput.join(", ") : emailsInput;
  const emails = parseInviteEmails(raw);
  if (emails.length === 0) return { ok: false, sent: 0, requested: 0, error: "no-emails" };

  // Resolve the inviting parent + their family's invite token.
  const [row] = await getDb()
    .select({
      firstName: signups.firstName,
      lastName: signups.lastName,
      inviteToken: families.inviteToken,
    })
    .from(signups)
    .innerJoin(families, eq(signups.familyId, families.id))
    .where(eq(signups.id, signupId))
    .limit(1);
  if (!row) return { ok: false, sent: 0, requested: emails.length, error: "not-found" };

  // Atomically reserve quota up front (counting attempts), then send only what
  // we were granted — race-safe against the spam/relay vector the cap bounds.
  const reserved = await reserveInviteQuota(signupId, emails.length);
  if (reserved <= 0)
    return { ok: false, sent: 0, requested: emails.length, reserved: 0, error: "limit" };
  const toSend = emails.slice(0, reserved);

  const inviterName = `${row.firstName} ${row.lastName}`.trim();
  const joinUrl = joinUrlFor(row.inviteToken);

  let sent = 0;
  for (const to of toSend) {
    // notifyCoParentInvite is best-effort (never throws), but guard anyway so one
    // bad recipient can't abort the batch.
    try {
      if (await notifyCoParentInvite({ to, inviterName, joinUrl })) sent += 1;
    } catch (err) {
      console.error("notifyCoParentInvite failed:", err);
    }
  }

  // Quota is reserved by attempt and not refunded — so flag the case where a
  // signup burned cap with zero deliveries (e.g. provider outage) for support.
  if (sent === 0) {
    console.error(
      `sendCoParentInvites: reserved ${reserved} invite(s) for signup ${signupId} but 0 sent`,
    );
  }

  return { ok: true, sent, requested: emails.length, reserved };
}
