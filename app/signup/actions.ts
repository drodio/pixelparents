"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { checkBotId } from "botid/server";
import { getDb } from "@/lib/db";
import { signups, type Photo } from "@/lib/db/schema/signups";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  US_STATES,
  BUILDER_INTEREST,
} from "@/lib/options";
import { signupSchema, linkedinUrlFromHandle } from "@/lib/validation";
import { notifyNewSignup, notifyApplicantWelcome } from "@/lib/email";
import { canonicalizeAgainstPool } from "@/lib/interests";

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
export async function createDraftSignup(): Promise<{ id: string } | { error: string }> {
  const v = await checkBotId();
  if (v.isBot) return { error: "blocked" };
  try {
    const [row] = await getDb()
      .insert(signups)
      .values({ firstName: "", lastName: "", email: "", phone: "", githubUsername: "" })
      .returning({ id: signups.id });
    return { id: row.id };
  } catch (err) {
    console.error("createDraftSignup failed:", err);
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
  builderInterest: string;
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
    // Fold onto the canonical spelling already in use (case-insensitive) so we
    // never store a duplicate that differs only by capitalization.
    set.parentInterests = s.length ? await canonicalizeAgainstPool(s) : null;
  }
  if ("photos" in patch && Array.isArray(patch.photos)) {
    set.photos = patch.photos
      .filter((p) => p && typeof p.url === "string" && typeof p.pathname === "string")
      .slice(0, 200);
  }
  if ("builderInterest" in patch) {
    const [cur] = await getDb()
      .select({ extra: signups.extra })
      .from(signups)
      .where(eq(signups.id, id))
      .limit(1);
    const extra = (cur?.extra ?? {}) as Record<string, unknown>;
    set.extra = { ...extra, builderInterest: oneOf(BUILDER_INTEREST, patch.builderInterest) };
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
    const [row] = await getDb()
      .insert(signups)
      .values({
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
