import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getInterestPool } from "@/lib/interests";
import { getSignupForEdit } from "@/lib/db/signups";
import { shareFieldsOrDefault } from "@/lib/share";
import { shareUrlFor } from "@/lib/url";
import { signedPhotoUrls } from "@/lib/blob";
import FamilyForm from "./family-form";
import { ShareSettings } from "./share-settings";

export const metadata: Metadata = {
  title: "Welcome — Pixel Parents",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DRODIO_SUBMISSION_URL = process.env.NEXT_PUBLIC_DRODIO_SUBMISSION_URL;

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; admin?: string }>;
}) {
  const { id, admin } = await searchParams;
  const validId = id && UUID_RE.test(id) ? id : null;
  const [editData, interestPool] = await Promise.all([
    validId ? getSignupForEdit(validId) : Promise.resolve(null),
    getInterestPool(),
  ]);

  const signup = editData?.signup ?? null;
  const firstName = signup?.firstName ?? null;
  const kids = editData?.kids ?? [];

  // Presign already-saved (private) family photos so the editor can show them
  // and resubmitting keeps them instead of wiping them.
  const initialPhotos = signup?.photos ?? [];
  const photoUrls = initialPhotos.length
    ? await signedPhotoUrls(initialPhotos.map((p) => p.pathname))
    : [];
  const initialPhotoPreviews: Record<string, string> = {};
  initialPhotos.forEach((p, i) => {
    if (photoUrls[i]) initialPhotoPreviews[p.pathname] = photoUrls[i]!;
  });

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
        initialEnabled={signup.shareEnabled}
        initialUrl={signup.shareToken ? shareUrlFor(signup.shareToken) : null}
        initialFields={shareFieldsOrDefault(signup.shareFields)}
      />
    ) : null;

  const subheading = (
    <h2 className="text-xl font-semibold text-white/90 sm:text-2xl">
      Please tell us about your interests + child(ren), below.
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
          <>
            <div className="mt-2">{subheading}</div>
            <div className="mt-6 space-y-4 text-white/70">
              <p>
                I&apos;m{" "}
                <a
                  href="https://festival.so/profile/founder/drodio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  DROdio
                </a>
                , dad to a student just entering OHS as a 7th grader. I&apos;m the
                CEO of{" "}
                <a
                  href="https://chief.bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  Chief
                </a>
                , an AI Chief of Staff startup in the SF Bay area. I love to build
                impactful software.
              </p>
              <p>
                My objective with this website is to build software that will
                transform the experiences of parents and students at OHS. I aim to
                not run afoul of any OHS rules &amp; regs, but also to stay
                independent as parents who want to make a difference and move fast
                with no politics.
              </p>
              <p>
                I hope to make everything we do{" "}
                <a
                  href="https://github.com/drodio/pixelparents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  open source
                </a>{" "}
                so others can benefit from it. Ensuring our kids&apos; safety and
                privacy is top-of-mind, and within that safe space I want to be as
                fully inclusive as possible.
              </p>
              <p>
                I have no idea (yet) what we&apos;ll build, but I want it to be
                impactful — and I want us to be proud of having enabled an
                incredible educational experience for our kids.
              </p>
              <p>
                I&apos;d also like a small data set to start with. If you&apos;re
                willing to fill out the info below about your child(ren) at OHS, we
                can use it as our initial seed data set before bringing other
                parents in.
                {DRODIO_SUBMISSION_URL ? (
                  <>
                    {" "}
                    For reference, here are{" "}
                    <a
                      href={DRODIO_SUBMISSION_URL}
                      className="text-amber-400 hover:underline"
                    >
                      my answers
                    </a>
                    .
                  </>
                ) : null}
              </p>
              <h2 className="pt-2 text-xl font-semibold text-white sm:text-2xl">
                Your location, interests &amp; child(ren)
              </h2>
              <p className="text-white/50">
                This information is optional — feel free to hold off until later if
                you prefer. It&apos;s stored in a Neon serverless Postgres
                database, and as a parent you maintain full control over your data.
                Only authenticated OHS families will ever see your answers.
              </p>
            </div>
          </>
        )}

        <div className="mt-10">
          <FamilyForm
            signupId={id ?? ""}
            suggestedInterests={interestPool}
            initialCity={signup?.city ?? ""}
            initialUsState={signup?.state ?? ""}
            initialParentInterests={signup?.parentInterests ?? []}
            initialPhotos={initialPhotos}
            initialPhotoPreviews={initialPhotoPreviews}
            existingChildren={kids.map((k) => ({
              id: k.id,
              firstName: k.firstName,
              grade: k.grade,
              birthYear: k.birthYear,
              interests: k.interests,
              notes: k.notes,
              photos: k.photos ?? [],
              photoPreviews: childPreviewsById[k.id] ?? {},
            }))}
          />
        </div>

        {!hasExistingData && sharePanel && <div className="mt-12">{sharePanel}</div>}
      </div>
    </main>
  );
}
