import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getFamilyForEmail } from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isStudentEmail } from "@/lib/verify";
import { signedPhotoUrls } from "@/lib/blob";
import { DashboardShell } from "@/components/dashboard-shell";
import { StudentVerify } from "@/components/student-verify";
import { IconGradCap } from "@/components/icons";
import FamilyForm from "@/app/signup/thanks/family-form";
import { getVerifyState } from "@/app/signup/thanks/verify-actions";
import { MemberCard } from "./member-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Family — Pixel Parents",
  robots: { index: false, follow: false },
};

export default async function FamilyPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = primaryEmail(user);
  const [family, isAdmin] = await Promise.all([
    email ? getFamilyForEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);

  const self = family?.self ?? null;
  const firstName = self?.firstName ?? user.firstName ?? null;
  const status: ApprovalStatus | null = self
    ? readApprovalStatus((self.extra ?? {}) as Record<string, unknown>)
    : null;

  // Empty state: this account has no signup yet.
  if (!family || !self) {
    return (
      <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your family</h1>
        </header>
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <IconGradCap className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-white">
              We don&apos;t have a family for this account yet
            </h2>
            <p className="mt-0.5 text-sm text-white/65">
              Sign up to create your family profile, add your kids, and invite co-parents.
            </p>
          </div>
          <Link
            href="/signup"
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Get started
          </Link>
        </div>
      </DashboardShell>
    );
  }

  // Order members: the caller first, then co-parents (already oldest-first).
  const others = family.members.filter((m) => m.id !== self.id);

  // Per-member "Student" flag: true when the member's OWN login email is an OHS
  // student email. Computed here (server-side) — lib/verify.ts imports node:crypto
  // and must not be pulled into the client bundle (member-card.tsx).
  const isStudentById = new Map<string, boolean>();
  for (const m of family.members) isStudentById.set(m.id, isStudentEmail(m.email));

  const [interestPool, verifyState] = await Promise.all([
    getInterestPool(),
    getVerifyState(self.id),
  ]);

  // Presign each child's private photos (keyed by child id) so the FamilyForm
  // editor can render them — mirrors app/signup/thanks/page.tsx.
  const childPreviewsById: Record<string, Record<string, string>> = {};
  await Promise.all(
    family.kids.map(async (k) => {
      const kp = k.photos ?? [];
      if (kp.length === 0) return;
      const urls = await signedPhotoUrls(kp.map((p) => p.pathname));
      const m: Record<string, string> = {};
      kp.forEach((p, i) => {
        if (urls[i]) m[p.pathname] = urls[i]!;
      });
      childPreviewsById[k.id] = m;
    }),
  );

  return (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your family</h1>
        <p className="mt-1 text-sm text-white/55">
          View and edit your profile, your kids, and everyone in your family.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {/* Parents (the caller + any co-parents). Any family member can edit any
            other member's details — authorized server-side by patchFamilyMember. */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Parents &amp; guardians
          </h2>
          <MemberCard
            member={self}
            isSelf
            isStudent={isStudentById.get(self.id) ?? false}
            suggestedInterests={interestPool}
          />
          {others.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              isSelf={false}
              isStudent={isStudentById.get(m.id) ?? false}
              suggestedInterests={interestPool}
            />
          ))}
        </section>

        {/* Children — reuses the family form (loads/edits the family's kids and
            auto-saves via patchChild, which is family-membership-authorized). */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Children
          </h2>
          <FamilyForm
            signupId={self.id}
            suggestedInterests={interestPool}
            existingChildren={family.kids.map((k) => ({
              id: k.id,
              firstName: k.firstName,
              grade: k.grade,
              birthYear: k.birthYear,
              interests: k.interests,
              notes: k.notes,
              studentEmail: k.studentEmail,
              photos: k.photos ?? [],
              photoPreviews: childPreviewsById[k.id] ?? {},
            }))}
          />
        </section>

        {/* Verification — same widget the thanks page uses, for the caller. */}
        {verifyState && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
              Verification
            </h2>
            <StudentVerify signupId={self.id} initial={verifyState} />
          </section>
        )}

        {/* Info note: how to link two accounts into one family (no merging here). */}
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
          To link two Pixel Parents accounts into one family, both accounts must verify
          under the same OHS student email (@ohs.stanford.edu).
        </p>
      </div>
    </DashboardShell>
  );
}
