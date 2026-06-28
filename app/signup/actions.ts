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
} from "@/lib/options";
import { signupSchema, linkedinUrlFromHandle } from "@/lib/validation";
import { notifyNewSignup, notifyApplicantWelcome, notifyCoParentInvite } from "@/lib/email";
import { createFamily, getFamilyByInviteToken, joinUrlFor } from "@/lib/family";
import { parseInviteEmails, INVITE_LIFETIME_CAP } from "@/lib/invite";

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
export async function createDraftSignup(): Promise<{ id: string } | { error: string }> {
  const v = await checkBotId();
  if (v.isBot) return { error: "blocked" };
  try {
    const family = await createFamily();
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
  parentInterests: string[];
  photos: Photo[];
}>;

// Patch only the provided columns on an existing (draft or saved) signup row.
// Sanitizes each field; enum fields are membership-checked. No bot re-check.
export async function patchSignup(id: string, patch: SignupPatch): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(id)) return { ok: false };
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
    set.parentInterests = s.length ? s : null;
  }
  if ("photos" in patch && Array.isArray(patch.photos)) {
    set.photos = patch.photos
      .filter((p) => p && typeof p.url === "string" && typeof p.pathname === "string")
      .slice(0, 200);
  }
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
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  const extra = (row.extra ?? {}) as Record<string, unknown>;
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
    await getDb()
      .update(signups)
      .set({ extra: { ...extra, notified: true } })
      .where(eq(signups.id, id));
  }
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
