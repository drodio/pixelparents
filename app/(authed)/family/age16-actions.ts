"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { children, signups } from "@/lib/db/schema/signups";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isStudentEmail } from "@/lib/verify";
import { createNotification } from "@/lib/db/notifications";

// --- Student 16+ contact-certification actions --------------------------------
//
// Policy (see lib/contact-visibility.ts): a student's OWN contact is masked
// (parent contact shown instead) until a PARENT certifies the student is 16+.
// A student can only REQUEST certification; a parent approves. Every write is
// authorized entirely server-side (caller derived from the Clerk session, scoped
// to the caller's family) and records WHO did it (attribution).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve the signed-in caller to their signup row. Never trust a caller id from
// the client — the session email is the sole source of identity.
async function caller(): Promise<{ id: string; familyId: string | null; email: string } | null> {
  const user = await currentUser();
  const email = user ? primaryEmail(user) : null;
  if (!email) return null;
  const row = await getSignupByEmail(email);
  if (!row) return null;
  return { id: row.id, familyId: row.familyId, email: row.email };
}

// NOTE: the PARENT certify/revoke (and approval of a pending request) is applied
// through the id-authorized `patchChild` (ChildPatch.age16Certified) so it works
// BOTH during signup (no Clerk session yet) and on the authed /family page — see
// app/signup/thanks/actions.ts. This file holds only the STUDENT's session-authed
// self-request, which patchChild can't express (it must verify the caller IS the
// student and notify the parents).

// STUDENT-only: request 16+ certification for THEIR OWN child record. Moves the
// record to 'pending' and notifies the family's parents to approve. Authorized by
// the child's studentEmail matching the caller's own (student) email — so a
// student can request only for the record that is actually them, never a sibling.
export async function requestChildAge16(childId: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(childId)) return { ok: false };
  const me = await caller();
  if (!me || !me.familyId) return { ok: false };
  if (!isStudentEmail(me.email)) return { ok: false }; // only a student may request

  try {
    // Own record only (case-insensitive email match), same family, and never
    // downgrade an already-certified record.
    const [child] = await getDb()
      .update(children)
      .set({ age16Status: "pending" as const, age16RequestedAt: new Date() })
      .where(
        and(
          eq(children.id, childId),
          eq(children.familyId, me.familyId),
          sql`lower(${children.studentEmail}) = ${me.email.toLowerCase()}`,
          ne(children.age16Status, "certified"),
        ),
      )
      .returning({ id: children.id });
    if (!child) return { ok: false };

    // Notify every PARENT (non-student member) in the family to approve.
    const members = await getDb()
      .select({ id: signups.id, email: signups.email })
      .from(signups)
      .where(eq(signups.familyId, me.familyId));
    const parents = members.filter((m) => m.email && !isStudentEmail(m.email));
    await Promise.all(
      parents.map((p) =>
        createNotification({
          recipientSignupId: p.id,
          type: "age16_cert_request",
          title: "A student asked to be certified 16+",
          body: "Approve to show their own contact info to the community — do it from the Family page.",
          link: "/family",
        }).catch((err) => {
          console.error("age16 request-notification failed:", err);
          return null;
        }),
      ),
    );

    revalidatePath("/family");
    return { ok: true };
  } catch (err) {
    console.error("requestChildAge16 failed:", err);
    return { ok: false };
  }
}
