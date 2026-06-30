import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSharedProfileByToken, getSignupByEmail } from "@/lib/db/signups";
import { shareFieldsOrDefault, coerceShareVisibility, canViewProfile } from "@/lib/share";
import { isStudentAccount } from "@/lib/family-display";
import { signedPhotoUrls } from "@/lib/blob";
import { renderCaption } from "@/lib/mentions";
import { builderStatusOf } from "@/lib/builder";
import {
  IconPhone,
  IconMail,
  IconCode,
  IconLinkedin,
  IconGithub,
  IconGradCap,
} from "@/components/icons";
import { PhotoCarousel, type CaptionPart } from "@/components/photo-carousel";
import { VisibilityControl } from "@/components/visibility-control";

// Shared, reusable profile renderer. Powers BOTH:
//   • the public secret share page  /p/<token>        (variant="public")
//   • the in-dashboard profile view /community/<token> (variant="dashboard")
// so the two never drift. The public variant is full-bleed (its own <main> +
// edge-to-edge banner); the dashboard variant is contained so it sits inside the
// DashboardShell tab without breaking out of the shell chrome.
//
// PRIVACY: a STUDENT account (extra.accountType === "student") is a minor, so
// this view coarsens it the SAME way the showcase card does — first name only,
// no precise city (region/country at most), and the children list is hidden —
// regardless of which fields they opted to share. Opt-in links (LinkedIn/GitHub)
// are gated behind the NEW, default-OFF "links" share field.

function Pills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/85"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-white/40">
      {children}
    </div>
  );
}

export type ProfileVariant = "public" | "dashboard";

export async function ProfileView({
  token,
  variant,
}: {
  token: string;
  variant: ProfileVariant;
}) {
  const profile = await getSharedProfileByToken(token);
  if (!profile) notFound();

  const { signup, kids } = profile;
  const visible = new Set(shareFieldsOrDefault(signup.shareFields));
  const isStudent = isStudentAccount(signup);

  // Viewer + the visibility gate (ohs / private).
  const viewer = await currentUser();
  const viewerEmail = primaryEmail(viewer);
  const loggedIn = Boolean(viewer);
  const isOwner = Boolean(
    viewerEmail && viewerEmail.toLowerCase() === signup.email.toLowerCase(),
  );
  const visibility = coerceShareVisibility(signup.shareVisibility);
  // An "OHS family" = a signed-in viewer who is themselves a signup. Only needed
  // for the "ohs" tier — skip the DB lookup for private profiles.
  const isOhsFamily =
    visibility === "ohs"
      ? isOwner || (loggedIn && Boolean(viewerEmail && (await getSignupByEmail(viewerEmail))))
      : false;
  const canView = canViewProfile(visibility, { isOwner, isOhsFamily });

  if (!canView) {
    // The dashboard variant is always reached by a signed-in OHS family through
    // the showcase, so a not-available here is rare; keep the message generic.
    return (
      <div
        className={
          variant === "public"
            ? "flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white"
            : "flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center text-white"
        }
      >
        <h1 className="text-2xl font-semibold">This profile isn&apos;t available</h1>
        <p className="max-w-md text-white/55">
          {visibility === "private"
            ? "This Pixel Parents profile is private — only the owner can view it."
            : loggedIn
              ? "This profile is shared with OHS families, and your account isn't recognized as one."
              : "This profile is shared with OHS families. Sign in with your OHS family account to view it."}
        </p>
        {!loggedIn && visibility === "ohs" && (
          <Link
            href="/sign-in"
            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-300"
          >
            Sign in
          </Link>
        )}
        {variant === "public" ? (
          <Link href="/" className="text-sm text-white/50 hover:underline">
            Pixel Parents →
          </Link>
        ) : (
          <Link href="/community" className="text-sm text-amber-400 hover:underline">
            ← Back to the community
          </Link>
        )}
      </div>
    );
  }

  // Location: parents may show "City, State"; a student is coarsened to the
  // region/country only (state, else country) — never the precise city.
  const location = isStudent
    ? signup.state || signup.country || ""
    : [signup.city, signup.state].filter(Boolean).join(", ");
  const interests = signup.parentInterests ?? [];
  const skillsets = visible.has("interests")
    ? (signup.skillsets ?? []).filter((s): s is string => Boolean(s?.trim()))
    : [];
  const showContact = visible.has("phone") || visible.has("email");
  // Builder recognition (commit check or manual flag) — community badge, not PII,
  // so it's shown to anyone who can view this profile regardless of share fields.
  const builder = builderStatusOf((signup.extra ?? {}) as Record<string, unknown>);

  // Opt-in professional links — only when the NEW "links" field is enabled.
  const showLinks = visible.has("links");
  const linkedinUrl = showLinks ? signup.linkedinUrl?.trim() || null : null;
  const githubUrl =
    showLinks && signup.githubUsername?.trim()
      ? `https://github.com/${signup.githubUsername.trim()}`
      : null;

  // A student card never lists children (a minor isn't shown as a "parent of").
  const showChildren = visible.has("children") && !isStudent && kids.length > 0;

  // Family photos + each child's photos, all in one gallery. Presign every photo
  // (family-level + per-child, only those that will be shown) once; look up by
  // pathname. A student's child photos are dropped along with the children list.
  const childPhotos = showChildren
    ? kids.flatMap((k) => (k.photos ?? []).map((p) => p.pathname))
    : [];
  const photoPaths = visible.has("photos")
    ? [...(signup.photos ?? []).map((p) => p.pathname), ...childPhotos]
    : [];
  const signedAll = photoPaths.length > 0 ? await signedPhotoUrls(photoPaths) : [];
  const urlByPath = new Map<string, string>();
  photoPaths.forEach((p, i) => {
    if (signedAll[i]) urlByPath.set(p, signedAll[i]);
  });
  // @-mentioned children become links that scroll to their section — but only
  // when children are shown (anchors exist) and the mentioned child is in this
  // shared profile. Otherwise the name renders as plain (unlinked) text.
  const kidIds = new Set(kids.map((k) => k.id));
  const toParts = (caption?: string | null): CaptionPart[] | null => {
    const segs = renderCaption(caption ?? "");
    if (segs.length === 0) return null;
    return segs.map((s) =>
      s.kind === "text"
        ? { kind: "text", text: s.text }
        : {
            kind: "mention",
            name: s.name,
            href: showChildren && kidIds.has(s.id) ? `#kid-${s.id}` : null,
          },
    );
  };
  const toCarousel = (ph: { pathname: string; caption?: string }[]) =>
    ph
      .map((p) => ({ url: urlByPath.get(p.pathname), caption: toParts(p.caption) }))
      .filter((s): s is { url: string; caption: CaptionPart[] | null } => Boolean(s.url));
  const familyCarousel = toCarousel(signup.photos ?? []);

  // The banner is the family's main (first) photo, if any.
  const bannerUrl = familyCarousel[0]?.url ?? null;
  const currentYear = new Date().getFullYear();

  // First name only for a student; full name for a parent.
  const displayName = isStudent
    ? signup.firstName
    : `${signup.firstName} ${signup.lastName ?? ""}`.trim();

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{displayName}</h1>
          {isStudent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-white/75">
              <IconGradCap className="h-3.5 w-3.5" strokeWidth={2} />
              OHS student
            </span>
          )}
        </div>
        {/* The visibility control only makes sense to the owner; it's a no-op for
            anyone else. Kept in both variants so an owner can manage from either. */}
        <VisibilityControl
          id={token}
          mode="token"
          value={visibility}
          editable={isOwner}
          loggedIn={loggedIn}
        />
      </div>
      {visible.has("location") && location && (
        <p className="mt-1.5 text-white/55">{location}</p>
      )}

      {builder.isBuilder && (
        <div className="mt-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-300"
            title={
              builder.contributions > 0
                ? `${builder.contributions} contribution${
                    builder.contributions === 1 ? "" : "s"
                  } to Pixel Parents`
                : "A Pixel Parents builder"
            }
          >
            <IconCode className="h-4 w-4" strokeWidth={2} />
            Builder
            {builder.contributions > 0 && (
              <span className="text-amber-300/70">
                · {builder.contributions} contribution
                {builder.contributions === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
      )}

      {(linkedinUrl || githubUrl) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-amber-400/40 hover:text-white"
            >
              <IconLinkedin className="h-4 w-4" />
              LinkedIn
            </a>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-amber-400/40 hover:text-white"
            >
              <IconGithub className="h-4 w-4" />
              GitHub
            </a>
          )}
        </div>
      )}

      {visible.has("interests") && interests.length > 0 && (
        <section className="mt-9">
          <Label>{isStudent ? "Interests" : "Parent interests"}</Label>
          <Pills items={interests} />
        </section>
      )}

      {skillsets.length > 0 && (
        <section className="mt-9">
          <Label>Skills</Label>
          <Pills items={skillsets} />
        </section>
      )}

      {familyCarousel.length > 0 && (
        <section className="mt-9">
          <Label>Photos</Label>
          <PhotoCarousel photos={familyCarousel} />
        </section>
      )}

      {showChildren && (
        <section className="mt-9">
          <Label>Children at OHS</Label>
          <div className="flex flex-col gap-3.5">
            {kids.map((kid) => {
              const kidPhotos = toCarousel(kid.photos ?? []);
              return (
                <div
                  key={kid.id}
                  id={`kid-${kid.id}`}
                  className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.02] p-5 target:ring-2 target:ring-amber-400/60"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-semibold">{kid.firstName}</h3>
                    {kid.grade === "Not an OHS child" && kid.birthYear && (
                      <span className="shrink-0 text-sm font-semibold text-amber-400">
                        age {currentYear - kid.birthYear}
                      </span>
                    )}
                  </div>
                  {kid.grade && (
                    <div className="mt-0.5 text-sm font-semibold text-amber-400">{kid.grade}</div>
                  )}
                  {kid.interests && kid.interests.length > 0 && (
                    <div className="mt-3">
                      <Pills items={kid.interests} />
                    </div>
                  )}
                  {kid.notes && <p className="mt-3 text-sm text-white/55">{kid.notes}</p>}
                  {kidPhotos.length > 0 && (
                    <div className="mt-4">
                      <PhotoCarousel photos={kidPhotos} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showContact && (
        <section className="mt-9">
          <Label>Contact</Label>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-white/85">
            {visible.has("phone") && signup.phone && (
              <span className="inline-flex items-center gap-1.5">
                <IconPhone className="h-4 w-4 text-white/50" />
                <a href={`tel:${signup.phone}`} className="text-amber-400 hover:underline">
                  {signup.phone}
                </a>
              </span>
            )}
            {visible.has("email") && signup.email && (
              <span className="inline-flex items-center gap-1.5">
                <IconMail className="h-4 w-4 text-white/50" />
                <a href={`mailto:${signup.email}`} className="text-amber-400 hover:underline">
                  {signup.email}
                </a>
              </span>
            )}
          </div>
        </section>
      )}
    </>
  );

  // --- Dashboard variant: contained, sits inside DashboardShell ----------------
  if (variant === "dashboard") {
    return (
      <div>
        <nav className="mb-4 text-sm text-white/50">
          <Link href="/community" className="text-amber-400 hover:underline">
            ← Community
          </Link>
        </nav>
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="mb-6 aspect-[13/5] w-full rounded-2xl object-cover object-top"
          />
        )}
        {body}
      </div>
    );
  }

  // --- Public variant: full-bleed /p page --------------------------------------
  return (
    <main className="min-h-dvh bg-black text-white">
      {bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="aspect-[13/5] w-full object-cover object-top"
        />
      )}
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {visibility === "ohs" && (
          <nav className="mb-2 text-sm text-white/50">
            <Link href="/community" className="text-amber-400 hover:underline">
              OHS Community
            </Link>{" "}
            &gt;
          </nav>
        )}
        {body}
      </div>
    </main>
  );
}
