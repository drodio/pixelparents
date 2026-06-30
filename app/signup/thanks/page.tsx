import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getInterestPool } from "@/lib/interests";
import { getSignupForEdit } from "@/lib/db/signups";
import { shareFieldsOrDefault, coerceShareVisibility } from "@/lib/share";
import { shareUrlFor } from "@/lib/url";
import { signedPhotoUrls } from "@/lib/blob";
import { getInviteTokenForFamily } from "@/lib/family";
import { familyReferralLinkFor } from "@/lib/referral";
import FamilyForm from "./family-form";
import StudentParentForm from "./student-parent-form";
import { ShareSettings } from "./share-settings";
import { ThanksInviteCta } from "./thanks-invite-cta";
import { getVerifyState } from "./verify-actions";
import { getStudentParentLinkStatus } from "./actions";
import { StudentVerify } from "@/components/student-verify";
import { isStudentAccount } from "@/lib/family-display";

export const metadata: Metadata = {
  title: "Welcome — Pixel Parents",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; admin?: string }>;
}) {
  const { id, admin } = await searchParams;
  const validId = id && UUID_RE.test(id) ? id : null;
  const [editData, interestPool, verifyState] = await Promise.all([
    validId ? getSignupForEdit(validId) : Promise.resolve(null),
    getInterestPool(),
    validId ? getVerifyState(validId) : Promise.resolve(null),
  ]);

  const signup = editData?.signup ?? null;
  const firstName = signup?.firstName ?? null;
  const kids = editData?.kids ?? [];

  // Student accounts (extra.accountType === "student") get a DIFFERENT step-2:
  // "add your parent / guardian" instead of "add children". The parent path is
  // untouched. We fetch the family-link status only for student accounts.
  const isStudent = signup ? isStudentAccount({ extra: signup.extra }) : false;
  const studentLinkStatus =
    validId && isStudent ? await getStudentParentLinkStatus(validId) : null;

  // Family-level photos are now collected on the first signup form; the thanks
  // page only needs whether any exist (to vary the heading), not their URLs.
  const initialPhotos = signup?.photos ?? [];

  // Light-touch growth CTA: once they've signed up, offer a shareable referral
  // link so they can pull in another OHS family. Reuses the family's existing
  // inviteToken (no new secret, no PII). Resolved server-side from the family id.
  const inviteToken = signup ? await getInviteTokenForFamily(signup.familyId) : null;
  const familyReferralUrl = inviteToken ? familyReferralLinkFor(inviteToken) : null;

  // Presign each child's photos too, keyed by child id — all children in
  // parallel so render latency doesn't grow with the number of children.
  const childPreviewsById: Record<string, Record<string, string>> = {};
  await Promise.all(
    kids.map(async (k) => {
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

  // "Editing" = the parent has already saved something. In that mode we drop the
  // marketing banner/intro, greet them as a returning editor, and surface the
  // share link up top.
  const hasExistingData = Boolean(
    signup &&
      (kids.length > 0 ||
        initialPhotos.length > 0 ||
        signup.city ||
        signup.state ||
        (signup.parentInterests?.length ?? 0) > 0),
  );

  const greeting = firstName
    ? hasExistingData
      ? `${firstName}, edit your info here:`
      : `${firstName}, nice to meet you.`
    : "Nice to meet you.";

  const sharePanel =
    validId && signup ? (
      <ShareSettings
        signupId={validId}
        initialVisibility={coerceShareVisibility(signup.shareVisibility)}
        initialUrl={signup.shareToken ? shareUrlFor(signup.shareToken) : null}
        initialFields={shareFieldsOrDefault(signup.shareFields)}
      />
    ) : null;

  const subheading = (
    <h2 className="text-xl font-semibold text-white/90 sm:text-2xl">
      {isStudent ? "Add your parent / guardian" : "Tell us about your child(ren)"}
    </h2>
  );

  return (
    <main className="min-h-dvh bg-black text-white">
      {!hasExistingData && (
        <Image
          src="/images/banner.webp"
          alt=""
          width={2000}
          height={1125}
          priority
          className="aspect-[13/5] w-full object-cover object-top"
        />
      )}
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {admin && id ? (
          <Link
            href={`/admin/parents/${id}/edit`}
            className="mb-4 inline-block text-sm font-medium text-amber-400 hover:underline"
          >
            ← Edit parent details
          </Link>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>

        {hasExistingData ? (
          <>
            {sharePanel && <div className="mt-6">{sharePanel}</div>}
            <div className="mt-8">{subheading}</div>
          </>
        ) : (
          <div className="mt-2">{subheading}</div>
        )}

        <div className="mt-10">
          {isStudent && validId && studentLinkStatus ? (
            // STUDENT path: the required step-2 action is "invite your parent /
            // guardian" (reusing the co-parent invite mechanism). Students do
            // NOT add children.
            <StudentParentForm signupId={validId} initialStatus={studentLinkStatus} />
          ) : (
            // PARENT path: unchanged — add children + the existing UI.
            <FamilyForm
              signupId={id ?? ""}
              suggestedInterests={interestPool}
              existingChildren={kids.map((k) => ({
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
          )}
        </div>

        {validId && signup && verifyState && (
          <div className="mt-10">
            <StudentVerify signupId={validId} initial={verifyState} />
            {verifyState.status !== "approved" && (
              <p className="mt-3 text-center text-sm text-white/45">
                <Link href="/dashboard" className="hover:text-white/80">
                  I&apos;ll verify later — go to my dashboard →
                </Link>
              </p>
            )}
          </div>
        )}

        {!hasExistingData && sharePanel && <div className="mt-12">{sharePanel}</div>}

        {familyReferralUrl && (
          <div className="mt-12">
            <ThanksInviteCta referralUrl={familyReferralUrl} />
          </div>
        )}
      </div>
    </main>
  );
}
