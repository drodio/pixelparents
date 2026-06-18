"use server";

import { redirect } from "next/navigation";
import { checkBotId } from "botid/server";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { signupSchema, linkedinUrlFromHandle } from "@/lib/validation";
import { notifyNewSignup, notifyApplicantWelcome } from "@/lib/email";

export type SignupState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

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
