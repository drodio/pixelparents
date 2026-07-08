import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSharedProfileByToken, getSignupByEmail } from "@/lib/db/signups";
import { shareFieldsOrDefault, coerceShareVisibility, canViewProfile } from "@/lib/share";
import { isStudentAccount } from "@/lib/family-display";
import { resolveStudentContact } from "@/lib/contact-visibility";
import { signedPhotoUrls } from "@/lib/blob";
import { renderCaption } from "@/lib/mentions";
import { builderStatusOf } from "@/lib/builder";
import { childFullName, aggregatedChildInterests } from "@/lib/directory";
import {
  websiteUrlOf,
  curatedEnrichmentOf,
  type StoredEnrichment,
} from "@/lib/enrichment/profile";
import { IconGlobe } from "@/components/icons";
import {
  IconPhone,
  IconMail,
  IconCode,
  IconLinkedin,
  IconGithub,
  IconGradCap,
  IconSparkles,
} from "@/components/icons";
import { PhotoCarousel, type CaptionPart } from "@/components/photo-carousel";
import { VisibilityControl } from "@/components/visibility-control";
import { TagList } from "@/components/tag-list";
import { ConnectCta } from "@/app/(authed)/directory/connect-cta";

// Shared, reusable profile renderer. Powers BOTH:
//   • the public secret share page  /p/<token>        (variant="public")
//   • the in-dashboard profile view /directory/<token> (variant="dashboard")
// so the two never drift. The public variant is full-bleed (its own <main> +
// edge-to-edge banner); the dashboard variant is contained so it sits inside the
// DashboardShell tab without breaking out of the shell chrome.
//
// PRIVACY: a STUDENT account (extra.accountType === "student") is a minor, so
// this view coarsens it the SAME way the showcase card does — first name only,
// no precise city (region/country at most), and the children list is hidden —
// regardless of which fields they opted to share. Opt-in links (LinkedIn/GitHub)
// are gated behind the NEW, default-OFF "links" share field.

// Interest / skill / expertise chip blocks. Long lists collapse to the first
// few with a "+N more" toggle (TagList owns the collapse logic) so a profile
// with dozens of tags doesn't render as one big messy block.
function Pills({ items }: { items: string[] }) {
  return (
    <TagList
      tags={items}
      className="flex flex-wrap items-center gap-2"
      chipClassName="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/85"
      toggleClassName="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/85"
    />
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

  const { signup, kids, familyStudentAccounts, parentContact } = profile;
  const visible = new Set(shareFieldsOrDefault(signup.shareFields));
  const isStudent = isStudentAccount(signup);

  // Age-16 contact gate: a STUDENT's own contact is masked (the parent's contact
  // is shown instead, with a note) until a parent certifies them 16+. Parent
  // profiles are never masked. We read the age-16 status off the matched child row
  // (studentEmail === this account's email). Fails closed via resolveStudentContact.
  const matchedChild = isStudent
    ? kids.find(
        (k) => (k.studentEmail ?? "").toLowerCase() === signup.email.toLowerCase(),
      )
    : undefined;
  const studentContact = isStudent
    ? resolveStudentContact({
        status: matchedChild?.age16Status,
        studentEmail: signup.email,
        parentEmail: parentContact?.email ?? null,
      })
    : null;
  const usingParentContact = Boolean(studentContact?.usingParentContact);
  // Email/phone to actually render: the student's own when certified, else the
  // parent's fallback (phone follows the same substitution).
  const displayEmail = studentContact ? studentContact.email : signup.email;
  const displayPhone = usingParentContact ? parentContact?.phone ?? null : signup.phone;

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
          <Link href="/directory" className="text-sm text-amber-400 hover:underline">
            ← Back to the directory
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

  // Opt-in professional links — only when the NEW "links" field is enabled. The
  // personal website rides with the same opt-in (it's a professional link too).
  const showLinks = visible.has("links");
  const linkedinUrl = showLinks ? signup.linkedinUrl?.trim() || null : null;
  const githubUrl =
    showLinks && signup.githubUsername?.trim()
      ? `https://github.com/${signup.githubUsername.trim()}`
      : null;
  const extra = (signup.extra ?? {}) as Record<string, unknown>;
  const websiteUrl = showLinks ? websiteUrlOf(extra) : null;

  // Curated auto-built profile (bio / expertise / how-they-can-help) — behind the
  // NEW, default-OFF "profile_enrichment" share field. ONLY the curated info is
  // shown here; the raw facts + source-status roster are owner-only (family page).
  // This view is already behind the canViewProfile gate above, so a signed-out
  // viewer never reaches it — zero enrichment PII leaks.
  const enrichment = visible.has("profile_enrichment")
    ? curatedEnrichmentOf(extra.enrichment as StoredEnrichment | null | undefined)
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

  // "Connect with this person" CTA (Daniel's #d5u7YmwJ feedback). Shown only to a
  // signed-in viewer who ISN'T the profile owner — never "connect with yourself",
  // and a signed-out viewer never reaches this code (canViewProfile gate above).
  // The composer page (/community/new) re-authorizes the viewer as a VERIFIED
  // family server-side, so a not-yet-verified viewer who taps through gets the
  // clear "verify to post" prompt rather than a silent dead end.
  const canConnect = loggedIn && !isOwner;
  // The person's OWN topics, offered as click-to-select chips in the composer so
  // the user picks context with taps: their interests + shared skills + any shared
  // enrichment expertise, deduped case-insensitively (first spelling wins).
  const connectTopics = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    // Only surface interests as composer chips when the owner opted into sharing
    // them (same gate the "Parent interests" display uses at `visible.has`). A
    // member who turned the interests share OFF must never have those interests
    // leak into the Connect composer chips or the ?topics= URL param.
    const topicInterests = visible.has("interests") ? interests : [];
    for (const t of [...topicInterests, ...skillsets, ...(enrichment?.expertiseTags ?? [])]) {
      const clean = t?.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  })();

  // Header (name + student badge + location + visibility control). Rendered
  // inside a banner-overlap wrapper when there's a banner photo, or standalone
  // when there isn't — see headerBlock / variant rendering below.
  const nameRow = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight drop-shadow-sm sm:text-4xl">
            {displayName}
          </h1>
          {isStudent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-white/75 backdrop-blur-sm">
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
        <p className="mt-1.5 text-white/60">{location}</p>
      )}
      {canConnect && (
        <div className="mt-4">
          <ConnectCta signupId={signup.id} name={displayName} topics={connectTopics} />
        </div>
      )}
    </>
  );

  const body = (
    <>
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

      {(linkedinUrl || githubUrl || websiteUrl) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-amber-400/40 hover:text-white"
            >
              <IconGlobe className="h-4 w-4" />
              Website
            </a>
          )}
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

      {/* Curated auto-built profile (shared, owner-controlled). Only bio /
          expertise / how-they-can-help — never the raw facts or source roster.
          Presented in a subtly elevated card with an "auto-built" indicator so
          the app's most advanced feature reads as such. */}
      {enrichment && (
        <section className="mt-9">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Label>About</Label>
            {/* Completion + save state for the app's auto-built enrichment. The
                curated profile only renders once enrichment has finished and been
                saved, so this badge is the clear "done + saved" indicator (and
                notes when the owner has since refined it by hand). */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-amber-200"
              title={
                enrichment.editedByOwner
                  ? "Auto-built by Pixel Parents, then refined by this member. Saved."
                  : "Automatically built by Pixel Parents. Saved."
              }
            >
              <IconSparkles className="h-3 w-3" />
              {enrichment.editedByOwner ? "Auto-built · edited" : "Auto-built profile"}
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            {enrichment.bio && (
              <p className="text-[15px] leading-relaxed text-white/80">{enrichment.bio}</p>
            )}
            {enrichment.expertiseTags.length > 0 && (
              <div className={enrichment.bio ? "mt-5" : ""}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
                  Areas of expertise
                </div>
                <Pills items={enrichment.expertiseTags} />
              </div>
            )}
            {enrichment.canHelpWith.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
                  How they can help
                </div>
                <ul className="space-y-1.5 text-[15px] text-white/75">
                  {enrichment.canHelpWith.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70"
                      />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
              // When this child is also a real student account, show the
              // de-duplicated UNION of their kid-interest tags and that account's
              // accurate expertise signals — consistent with the directory card.
              const kidInterests = aggregatedChildInterests(kid, familyStudentAccounts);
              return (
                <div
                  key={kid.id}
                  id={`kid-${kid.id}`}
                  className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.02] p-5 target:ring-2 target:ring-amber-400/60"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      {childFullName(kid.firstName, signup.lastName)}
                    </h3>
                    {kid.grade === "Not an OHS child" && kid.birthYear && (
                      <span className="shrink-0 text-sm font-semibold text-amber-400">
                        age {currentYear - kid.birthYear}
                      </span>
                    )}
                  </div>
                  {kid.grade && kid.grade !== "Not an OHS child" && (
                    <div className="mt-0.5 text-sm font-semibold text-amber-400">{kid.grade}</div>
                  )}
                  {kidInterests.length > 0 && (
                    <div className="mt-3">
                      <Pills items={kidInterests} />
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
            {visible.has("phone") && displayPhone && (
              <span className="inline-flex items-center gap-1.5">
                <IconPhone className="h-4 w-4 text-white/50" />
                <a href={`tel:${displayPhone}`} className="text-amber-400 hover:underline">
                  {displayPhone}
                </a>
              </span>
            )}
            {visible.has("email") && displayEmail && (
              <span className="inline-flex items-center gap-1.5">
                <IconMail className="h-4 w-4 text-white/50" />
                <a href={`mailto:${displayEmail}`} className="text-amber-400 hover:underline">
                  {displayEmail}
                </a>
              </span>
            )}
          </div>
          {/* Minor-safety: when a student isn't 16+-certified we show the parent's
              contact instead of the student's own — say so plainly. */}
          {usingParentContact && (displayPhone || displayEmail) && (
            <p className="mt-2 text-xs text-white/45">
              This is the parent&rsquo;s contact. This student hasn&rsquo;t been
              certified as 16 or older, so their own contact info is kept private.
            </p>
          )}
        </section>
      )}
    </>
  );

  // --- Dashboard variant: contained, sits inside DashboardShell ----------------
  if (variant === "dashboard") {
    return (
      <div>
        <nav className="mb-4 text-sm text-white/50">
          <Link href="/directory" className="text-amber-400 hover:underline">
            ← Directory
          </Link>
        </nav>
        {bannerUrl ? (
          // Banner with a bottom gradient scrim; the name overlaps the banner
          // for a designed header rather than a stacked photo-then-text flow.
          <div className="relative mb-6 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="aspect-[13/5] w-full object-cover object-top"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">{nameRow}</div>
          </div>
        ) : (
          <div className="mb-6">{nameRow}</div>
        )}
        {body}
      </div>
    );
  }

  // --- Public variant: full-bleed /p page --------------------------------------
  return (
    <main className="min-h-dvh bg-black text-white">
      {bannerUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-[13/5] w-full object-cover object-top"
          />
          {/* Scrim so the overlapped name stays legible over any photo. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/40 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto w-full max-w-2xl px-6 pb-5 sm:pb-6">{nameRow}</div>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {visibility === "ohs" && (
          <nav className="mb-2 text-sm text-white/50">
            <Link href="/directory" className="text-amber-400 hover:underline">
              OHS Directory
            </Link>{" "}
            &gt;
          </nav>
        )}
        {!bannerUrl && <div className="mb-6">{nameRow}</div>}
        {body}
      </div>
    </main>
  );
}
