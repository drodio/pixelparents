import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { readApprovalStatus } from "@/lib/approval";
import { getRequestByClerkUser } from "@/lib/db/api-keys";
import { getSignupByEmail } from "@/lib/db/signups";
import { hasDatabase } from "@/lib/db";
import { shareFieldsOrDefault, coerceShareVisibility } from "@/lib/share";
import { shareUrlFor } from "@/lib/url";
import { ShareSettings } from "@/app/signup/thanks/share-settings";
import { DashboardShell } from "@/components/dashboard-shell";
import { IconClock } from "@/components/icons";
import { KeyPanel } from "./key-panel";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account — Pixel Parents" };

function AccountHeader() {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
        <p className="mt-1 text-sm text-white/55">Your API access and family profile.</p>
      </div>
      <UserButton />
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

  return (
    <DashboardShell firstName={firstName} email={email} status={approvalStatus} isAdmin={isAdmin}>
      <AccountHeader />

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold tracking-tight">Developer API</h2>
        {reqStatus === "approved" ? (
          <>
            <KeyPanel hasKey={Boolean(req?.keyHash)} prefix={req?.keyPrefix ?? null} />
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
