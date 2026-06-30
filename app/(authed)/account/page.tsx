import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { readApprovalStatus } from "@/lib/approval";
import { getRequestByClerkUser } from "@/lib/db/api-keys";
import { getSignupByEmail } from "@/lib/db/signups";
import { hasDatabase } from "@/lib/db";
import { formatLastUsed } from "@/lib/format";
import { shareFieldsOrDefault, coerceShareVisibility } from "@/lib/share";
import { shareUrlFor } from "@/lib/url";
import { getVerifyState } from "@/app/signup/thanks/verify-actions";
import { ShareSettings } from "@/app/signup/thanks/share-settings";
import { DashboardShell } from "@/components/dashboard-shell";
import { StudentVerify } from "@/components/student-verify";
import { IconClock, IconCode, IconGradCap } from "@/components/icons";
import { KeyPanel } from "./key-panel";
import { RequestForm } from "./request-form";
import { AccountSettings } from "./account-settings";
import { ConnectedAppsPanel } from "./connected-apps-panel";
import { getConnectedApps } from "./connected-apps-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account — Pixel Parents" };

// Lightweight, read-only telemetry for an approved key: when it was last seen on
// the API and how many requests it has served. Both values are bumped best-effort
// in verifyApiKey, so they're informational, never authoritative.
function UsagePanel({
  lastUsedAt,
  requestCount,
}: {
  lastUsedAt: Date | string | null;
  requestCount: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Usage</p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-2.5">
          <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
          <div>
            <dt className="text-xs text-white/55">Last used</dt>
            <dd className="text-sm font-medium text-white/90">{formatLastUsed(lastUsedAt)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <IconCode className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
          <div>
            <dt className="text-xs text-white/55">Total requests</dt>
            <dd className="text-sm font-medium text-white/90">{requestCount.toLocaleString()}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

function AccountHeader() {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
        <p className="mt-1 text-sm text-white/55">
          Your profile, API access, and family settings.
        </p>
      </div>
      {/* Kept for one-click Sign out; "Manage account" now lives inline below. */}
      <UserButton appearance={clerkAppearance} />
    </header>
  );
}

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) return null; // middleware redirects unauthenticated visitors

  const email = primaryEmail(user);
  const isAdmin = await isAdminEmail(email);

  if (!hasDatabase()) {
    return (
      <DashboardShell firstName={user.firstName ?? null} email={email} status={null} isAdmin={isAdmin}>
        <AccountHeader />
        <p className="text-sm text-white/60">
          The API isn&apos;t fully configured yet. Please check back soon.
        </p>
      </DashboardShell>
    );
  }

  const req = await getRequestByClerkUser(user.id);
  const reqStatus = req?.status ?? "none";

  // If this signed-in user also filled out the parent signup form (matched by
  // email), surface their verification status + secret share link here too.
  const signup = email ? await getSignupByEmail(email) : null;
  const approvalStatus = signup
    ? readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>)
    : null;
  const firstName = signup?.firstName ?? user.firstName ?? null;

  // Verified-students panel: hydrate the same widget the thanks/verify pages use.
  // verifyState.verifiedEmails carries the family's full deduped list (a family
  // can verify many OHS students); the widget lets them add another.
  const verifyState = signup ? await getVerifyState(signup.id) : null;

  // Connected apps: every "Sign in with Pixel Parents" app this user authorized
  // (keyed to their Clerk user id, so no other-user data is read).
  const connectedApps = await getConnectedApps();

  return (
    <DashboardShell firstName={firstName} email={email} status={approvalStatus} isAdmin={isAdmin}>
      <AccountHeader />

      <section id="settings" className="mb-8 flex scroll-mt-8 flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Account settings</h2>
          <p className="mt-1 text-sm text-white/55">
            Edit your profile, email addresses, password, and security settings.
          </p>
        </div>
        <AccountSettings />
      </section>

      <section className="flex flex-col gap-5 border-t border-white/10 pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Developer API</h2>
        {reqStatus === "approved" ? (
          <>
            <KeyPanel hasKey={Boolean(req?.keyHash)} prefix={req?.keyPrefix ?? null} />
            <UsagePanel
              lastUsedAt={req?.lastUsedAt ?? null}
              requestCount={req?.requestCount ?? 0}
            />
            <p className="text-sm text-white/50">
              Use it as{" "}
              <code className="font-mono text-xs text-white/80">
                Authorization: Bearer &lt;key&gt;
              </code>
              . Full endpoint docs are on the{" "}
              <Link href="/developers" className="text-emerald-300 hover:underline">
                Developer API page
              </Link>
              .
            </p>
          </>
        ) : reqStatus === "pending" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <p className="flex items-center gap-1.5 font-semibold">
              <IconClock className="h-4 w-4 text-white/70" /> Your request is under review
            </p>
            <p className="text-sm text-white/60">
              We review every request by hand. You&apos;ll get an email when it&apos;s approved, and
              your API key will show up right here.
            </p>
          </div>
        ) : reqStatus === "rejected" ? (
          <>
            <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
              <p className="font-semibold text-red-300">This request wasn&apos;t approved</p>
              {req?.rejectReason && <p className="text-sm text-white/70">Note: {req.rejectReason}</p>}
              <p className="text-sm text-white/60">You&apos;re welcome to apply again below.</p>
            </div>
            <RequestForm />
          </>
        ) : (
          <>
            <p className="text-sm text-white/60">
              The Pixel Parents API is limited to OHS families. Tell us what you&apos;d like to build
              and we&apos;ll review your request.
            </p>
            <RequestForm />
          </>
        )}
      </section>

      <section
        id="connected-apps"
        className="mt-8 flex scroll-mt-8 flex-col gap-4 border-t border-white/10 pt-8"
      >
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Connected apps</h2>
          <p className="mt-1 text-sm text-white/55">
            Apps you&apos;ve signed in to with Pixel Parents, and what each can see. Revoke
            access anytime — they&apos;ll have to ask permission again next time.
          </p>
        </div>
        <ConnectedAppsPanel apps={connectedApps} />
      </section>

      {signup && verifyState && (
        <section
          id="students"
          className="mt-8 flex scroll-mt-8 flex-col gap-4 border-t border-white/10 pt-8"
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your verified students</h2>
            <p className="mt-1 text-sm text-white/55">
              Every OHS student your family has verified. You can verify as many as
              you like.
            </p>
          </div>
          {verifyState.verifiedEmails.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {verifyState.verifiedEmails.map((studentEmail) => (
                <li
                  key={studentEmail}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-1 text-sm text-emerald-100"
                >
                  <IconGradCap className="h-4 w-4 text-emerald-300" />
                  {studentEmail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/45">
              No students verified yet. Add one below to unlock the OHS directory showcase.
            </p>
          )}
          <StudentVerify signupId={signup.id} initial={verifyState} allowAddMore />
        </section>
      )}

      {signup && (
        <section className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your family profile</h2>
            <p className="mt-1 text-sm text-white/55">
              Share what you submitted with specific people via a secret link.
            </p>
          </div>
          <ShareSettings
            signupId={signup.id}
            initialVisibility={coerceShareVisibility(signup.shareVisibility)}
            initialUrl={signup.shareToken ? shareUrlFor(signup.shareToken) : null}
            initialFields={shareFieldsOrDefault(signup.shareFields)}
          />
        </section>
      )}
    </DashboardShell>
  );
}
