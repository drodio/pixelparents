import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { AccountSetupForm } from "@/components/AccountSetupForm";
import { ProfileSettingsSection } from "@/components/ProfileSettingsSection";
import { LocationLine } from "@/components/LocationLine";
import { FamilySection } from "@/components/FamilySection";
import { loadFamilyForAccount } from "@/lib/family";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { profileUrlFor } from "@/lib/profile-slug";
import type { SlugKind } from "@/lib/profile-slug-validate";
import { EventConnectionPref } from "@/components/events/EventConnectionPref";
import { getConnectionPreferences, connectionChoiceForScope, type PrefAction } from "@/lib/attendee-connections";
import { listMemberMessagesForViewer } from "@/lib/member-messages";
import { MessagesSection } from "@/components/account/MessagesSection";

export const dynamic = "force-dynamic";

// Account settings page — accessed from the Clerk UserButton dropdown after
// initial setup. Reuses AccountSetupForm in "settings" mode (no bottom
// "Finalize Membership" CTA; all toggles save on click). Email + phone
// cards still render so the user can swap or add contact methods.
//
// Claimed users (users row + evaluation_id set) also see a Profile URL &
// Nickname section that lets them edit how they're addressed and what
// vanity URL serves their profile.
export default async function AccountPage() {
  // Tolerate stale-Clerk-session (deleted user 404) — treat as signed-out.
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/");

  // Resolve "back to my profile" target for the breadcrumb. Falls back to
  // home for unclaimed users (no users row), so the link is always sensible.
  const profileHref = await loadMyProfileUrl(user.id);
  // Claimed-user data for the Profile URL & Nickname section. Null when
  // unclaimed; the section conditionally renders.
  const claimed = await loadClaimedProfile(user.id);
  // Kids & Family — deploy-safe: available=false if unclaimed OR the tables
  // don't exist yet (prod, before the manual migration), so the section just
  // doesn't render rather than 500ing the account page.
  const family = await loadFamilyForAccount(user.id);
  // An operator/CSV phone we have on file (e.g. from an event guest list) that
  // the user can one-tap verify in the Text card. Null when we have none.
  const suggestedPhone = await loadSuggestedPhone(user.id);
  // Global default for "Allow event connection requests?" — applied to future
  // events (each event can override). Null when unclaimed (prefs key on a profile).
  const globalConnectionChoice = claimed ? await loadGlobalConnectionChoice(user.id) : null;
  // The member-facing email inbox. Matched by clerk id OR (for messages logged
  // before they claimed) their evaluation id.
  const viewerEvaluationId = await loadViewerEvaluationId(user.id);
  const messages = await listMemberMessagesForViewer({ clerkUserId: user.id, evaluationId: viewerEvaluationId });

  return (
    <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <a href="/?home=1" className="opacity-90 hover:opacity-100">
            <img
              src="/images/founder-festival-logo.png"
              alt="Founder Festival"
              width={498}
              height={444}
              className="w-10 h-auto"
            />
          </a>
          <nav aria-label="Breadcrumb" className="text-sm text-zinc-400">
            <a
              href={profileHref}
              className="text-amber-400 hover:text-amber-300 hover:underline underline-offset-4"
            >
              Profile
            </a>
            <span className="mx-2 text-zinc-600" aria-hidden>
              ›
            </span>
            <span className="text-zinc-200" aria-current="page">
              Account
            </span>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Account
          </h1>
          <p className="text-sm text-zinc-400">
            Manage your contact methods and notification preferences.
          </p>
        </div>
        <AccountSetupForm mode="settings" suggestedPhone={suggestedPhone} />
        <section id="messages" className="mt-10 flex flex-col gap-3 scroll-mt-20">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl font-bold">Messages</h2>
            <p className="text-sm text-zinc-400">
              Event emails, connection requests, and other messages we&rsquo;ve sent you.
            </p>
          </div>
          <MessagesSection messages={messages} />
        </section>
        {claimed && <ProfileSettingsSection initial={claimed} />}
        {claimed && globalConnectionChoice && (
          <section id="event-connections" className="mt-10 flex flex-col gap-3 scroll-mt-20">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl font-bold">Event connections</h2>
              <p className="text-sm text-zinc-400">
                Your default for connection requests at events you attend. Each event can override
                this on its page.
              </p>
            </div>
            <EventConnectionPref scope="global" initial={globalConnectionChoice} />
          </section>
        )}
        {claimed && (
          <section id="location" className="mt-10 flex flex-col gap-3 scroll-mt-20">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl font-bold">Location</h2>
              <p className="text-sm text-zinc-400">
                Shown under your name on your profile. City, state/region, and
                country are each optional — fill in what makes sense.
              </p>
            </div>
            <LocationLine
              initialCity={claimed.city}
              initialRegion={claimed.region}
              initialCountry={claimed.country}
              canEdit={true}
            />
          </section>
        )}
        {family.available && (
          <section id="family" className="mt-10 scroll-mt-20">
            <FamilySection initialMembers={family.members} />
          </section>
        )}
      </main>
    </div>
  );
}

type ClaimedProfileInitial = {
  nickname: string | null;
  slug: string;
  slugKind: SlugKind;
  fullName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  websiteUrl: string | null;
};

async function loadViewerEvaluationId(clerkUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row?.evaluationId ?? null;
}

async function loadGlobalConnectionChoice(clerkUserId: string): Promise<PrefAction | null> {
  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (!row?.evaluationId) return null;
  const prefs = await getConnectionPreferences(row.evaluationId);
  return connectionChoiceForScope(prefs, "global");
}

async function loadClaimedProfile(clerkUserId: string): Promise<ClaimedProfileInitial | null> {
  const [row] = await db
    .select({
      nickname: users.nickname,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      fullName: evaluations.fullName,
      city: users.city,
      region: users.region,
      country: users.country,
      websiteUrl: users.websiteUrl,
    })
    .from(users)
    .innerJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!row || !row.slug || !row.slugKind) return null;
  if (row.slugKind !== "founder" && row.slugKind !== "investor") return null;

  return {
    nickname: row.nickname,
    slug: row.slug,
    slugKind: row.slugKind,
    fullName: row.fullName,
    city: row.city,
    region: row.region,
    country: row.country,
    websiteUrl: row.websiteUrl,
  };
}

// The operator/CSV-provided phone on the user's claimed evaluation (null when
// unclaimed or none on file). The Text card hides it client-side if it already
// matches a number on the Clerk account.
async function loadSuggestedPhone(clerkUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ phone: evaluations.phone })
    .from(users)
    .innerJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row?.phone ?? null;
}

async function loadMyProfileUrl(clerkUserId: string): Promise<string> {
  const [row] = await db
    .select({
      evalId: users.evaluationId,
      clerkUsername: users.clerkUsername,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
    })
    .from(users)
    .leftJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (!row || !row.evalId) return "/";
  return profileUrlFor({
    evalId: row.evalId,
    slug: row.slug,
    slugKind: row.slugKind,
    clerkUsername: row.clerkUsername,
  });
}
