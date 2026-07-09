import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getFamilyForEmail } from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isStudentEmail, verifiedEmailsOf } from "@/lib/verify";
import { buildFamilyDisplay } from "@/lib/family-display";
import { coerceShareVisibility } from "@/lib/share";
import { signedPhotoUrls } from "@/lib/blob";
import { getInviteTokenForFamily, joinUrlFor } from "@/lib/family";
import { familyReferralLinkFor, studentReferralLinkFor } from "@/lib/referral";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { StudentVerify } from "@/components/student-verify";
import { IconGradCap, IconUsers } from "@/components/icons";
import FamilyForm from "@/app/signup/thanks/family-form";
import { getVerifyState } from "@/app/signup/thanks/verify-actions";
import { MemberCard } from "./member-card";
import {
  FamilyInviteCard,
  SpreadTheWordCard,
  StudentReferralCard,
} from "./invite-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Family — GoPixel",
  robots: { index: false, follow: false },
};

export default async function FamilyPage() {
  const user = await currentUser();

  // Signed-out: render the grayed shell (locked tabs + sign-in CTA) instead of
  // bouncing. We return BEFORE any DB query, so a signed-out visitor never loads
  // or sees family PII (members, kids, photos, verification).
  if (!user) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="family" />
      </DashboardShell>
    );
  }

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

  // Per-member "Student" flag: true when the member's OWN login email is an OHS
  // student email. Computed here (server-side) — lib/verify.ts imports node:crypto
  // and must not be pulled into the client bundle (member-card.tsx).
  const isStudentById = new Map<string, boolean>();
  for (const m of family.members) isStudentById.set(m.id, isStudentEmail(m.email));

  // Section into "Parents & guardians" vs "Students" and DEDUP child rows against
  // student accounts (a child whose verified student email matches a student
  // account is folded into that account — one entry, not two; no rows deleted).
  // Pure projection — see lib/family-display.ts. We pass the canonical server-side
  // verifiedEmailsOf (lib/verify imports node:crypto, so it stays out of the lib).
  const { parentMembers, studentMembers, studentProfileByAccountId, unmatchedKids } =
    buildFamilyDisplay(family.members, family.kids, self.id, verifiedEmailsOf);

  const [interestPool, verifyState, inviteToken] = await Promise.all([
    getInterestPool(),
    getVerifyState(self.id),
    getInviteTokenForFamily(self.familyId),
  ]);

  // Invite links (the growth flywheel). All reuse the family's existing
  // hard-to-guess inviteToken — no new secret, no PII in any URL.
  // - joinUrl: co-parent join flow (/signup/join/<token>)
  // - familyReferralUrl: public "spread the word" signup link (/signup?ref=…)
  // - studentReferralUrl: student-to-student link (/signup?ref=…&as=student)
  const joinUrl = inviteToken ? joinUrlFor(inviteToken) : null;
  const familyReferralUrl = inviteToken ? familyReferralLinkFor(inviteToken) : null;
  const studentReferralUrl = inviteToken ? studentReferralLinkFor(inviteToken) : null;

  // Student-to-student referral is verification-gated: only surface it once the
  // family has at least one VERIFIED OHS student (a real student node). We check
  // every member's verified-emails blob (server-side; verifiedEmailsOf is pure).
  const hasVerifiedStudent = family.members.some(
    (m) => verifiedEmailsOf((m.extra ?? {}) as Record<string, unknown>).length > 0,
  );

  // Presign each child's private photos (keyed by child id) so the FamilyForm
  // editor can render them — mirrors app/signup/thanks/page.tsx.
  const childPreviewsById: Record<string, Record<string, string>> = {};
  await Promise.all(
    unmatchedKids.map(async (k) => {
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
        {/* Grow the community — invites (the growth flywheel). Prominent, warm,
            and reusing the existing family inviteToken + join/signup flows. */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Grow your community
          </h2>
          {joinUrl && <FamilyInviteCard signupId={self.id} joinUrl={joinUrl} />}
          {familyReferralUrl && <SpreadTheWordCard referralUrl={familyReferralUrl} />}
          {hasVerifiedStudent && studentReferralUrl && (
            <StudentReferralCard referralUrl={studentReferralUrl} />
          )}
        </section>

        {/* Visibility is per-member, and ANY family member can manage everyone's —
            authorized server-side by family membership (setFamilyMemberVisibility). */}
        <p className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
          <IconUsers className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <span>
            Visibility is set per member. Any family member can manage everyone&apos;s —
            choose who can see each person&apos;s profile below.
          </span>
        </p>

        {/* Parents &amp; guardians (the caller + any co-parents). Any family member
            can edit any other member's details — authorized server-side by
            patchFamilyMember. */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Parents &amp; guardians
          </h2>
          {parentMembers.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              isSelf={m.id === self.id}
              isStudent={isStudentById.get(m.id) ?? false}
              suggestedInterests={interestPool}
              initialVisibility={coerceShareVisibility(m.shareVisibility)}
            />
          ))}
        </section>

        {/* Students — student accounts, deduped against matching child rows. Each
            card is enriched with the matched child's grade + interests. */}
        {studentMembers.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
              Students
            </h2>
            {studentMembers.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                isSelf={m.id === self.id}
                isStudent={isStudentById.get(m.id) ?? false}
                suggestedInterests={interestPool}
                initialVisibility={coerceShareVisibility(m.shareVisibility)}
                studentProfile={studentProfileByAccountId.get(m.id)}
              />
            ))}
          </section>
        )}

        {/* Children — reuses the family form (loads/edits the family's kids and
            auto-saves via patchChild, which is family-membership-authorized). Kids
            whose verified student email matches a student account above are folded
            into that account (deduped) and omitted here — the rows are NOT deleted. */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Children
          </h2>
          <FamilyForm
            signupId={self.id}
            suggestedInterests={interestPool}
            existingChildren={unmatchedKids.map((k) => ({
              id: k.id,
              firstName: k.firstName,
              grade: k.grade,
              birthYear: k.birthYear,
              interests: k.interests,
              notes: k.notes,
              studentEmail: k.studentEmail,
              age16Status: k.age16Status,
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
          To link two GoPixel accounts into one family, both accounts must verify
          under the same OHS student email (@ohs.stanford.edu).
        </p>
      </div>
    </DashboardShell>
  );
}
