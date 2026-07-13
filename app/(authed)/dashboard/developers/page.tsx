import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getSignupByEmail } from "@/lib/db/signups";
import { getRequestByClerkUser } from "@/lib/db/api-keys";
import { readApprovalStatus } from "@/lib/approval";
import { hasDatabase } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight, IconClock, IconCode } from "@/components/icons";
import { KeyPanel } from "@/app/(authed)/account/key-panel";
import { RequestForm } from "@/app/(authed)/account/request-form";
import { OAuthAppsPanel } from "./oauth-apps-panel";
import { getMyOAuthApps } from "./oauth-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Developers — GoPixel",
  // In-dashboard view; never index it (the public /developers page is indexable).
  robots: { index: false, follow: false },
};

// A short, non-PII docs summary surfaced right in the tab. The full reference
// lives on the public /developers page (linked below).
const ENDPOINT_SUMMARY: Array<[string, string]> = [
  ["/api/v1/stats", "High-level community totals"],
  ["/api/v1/breakdowns", "Counts by state, tech depth, skillset, grade…"],
  ["/api/v1/trends", "Signups over time"],
  ["/api/v1/options", "Option taxonomies + interests pool"],
  ["/api/mcp", "MCP server — query from an AI agent"],
];

function DevHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Developers</h1>
      <p className="mt-1 text-sm text-white/55">
        Build on the GoPixel API — request a key, then explore non-PII community data.
      </p>
    </header>
  );
}

export default async function DashboardDevelopersPage() {
  const user = await currentUser();

  // Signed-out: grayed shell + locked prompt, NO DB/PII loaded. Matches the rest
  // of the consolidated dashboard.
  if (!user) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="developer tools" />
      </DashboardShell>
    );
  }

  const email = primaryEmail(user);
  const isAdmin = await isAdminEmail(email);

  // Resolve the caller's display name + verification status for the shell chrome
  // (same shape the account page passes). No other-family PII is read here.
  const signup = email ? await getSignupByEmail(email) : null;
  const firstName = signup?.firstName ?? user.firstName ?? null;
  const status = signup
    ? readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>)
    : null;

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  if (!hasDatabase()) {
    return shell(
      <>
        <DevHeader />
        <p className="text-sm text-white/60">
          The API isn&apos;t fully configured yet. Please check back soon.
        </p>
      </>,
    );
  }

  // The caller's own API request (auth-gated: keyed to their Clerk user). Drives
  // the same request → review → key flow as the account page.
  const req = await getRequestByClerkUser(user.id);
  const reqStatus = req?.status ?? "none";

  // The caller's registered "Sign in with GoPixel" OAuth apps. Owner-scoped
  // (keyed to their Clerk user) and best-effort (returns [] on any read error).
  const oauthApps = await getMyOAuthApps();

  return shell(
    <>
      <DevHeader />

      <div className="flex flex-col gap-8">
        {/* Access / request — reuses the account page's RequestForm + KeyPanel, so
            the request path stays auth-gated (submitRequest checks currentUser). */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Your API access</h2>
          {reqStatus === "approved" ? (
            <>
              <KeyPanel hasKey={Boolean(req?.keyHash)} prefix={req?.keyPrefix ?? null} />
              <p className="text-sm text-white/50">
                Authenticate with{" "}
                <code className="font-mono text-xs text-white/80">
                  Authorization: Bearer &lt;key&gt;
                </code>
                . Usage telemetry lives on your{" "}
                <Link href="/account" className="text-emerald-300 hover:underline">
                  account page
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
                We review every request by hand. You&apos;ll get an email when it&apos;s approved,
                and your API key will show up right here.
              </p>
            </div>
          ) : reqStatus === "rejected" ? (
            <>
              <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
                <p className="font-semibold text-red-300">This request wasn&apos;t approved</p>
                {req?.rejectReason && (
                  <p className="text-sm text-white/70">Note: {req.rejectReason}</p>
                )}
                <p className="text-sm text-white/60">You&apos;re welcome to apply again below.</p>
              </div>
              <RequestForm />
            </>
          ) : (
            <>
              <p className="text-sm text-white/60">
                The GoPixel API is limited to OHS families. Tell us what you&apos;d like to
                build and we&apos;ll review your request.
              </p>
              <RequestForm />
            </>
          )}
        </section>

        {/* Sign in with GoPixel — register a connected app + reveal/rotate
            its client_id + one-time client_secret. Self-serve for MVP. */}
        <section className="border-t border-white/10 pt-8">
          <OAuthAppsPanel apps={oauthApps} ownerApiApproved={reqStatus === "approved"} />
        </section>

        {/* Docs summary — counts/taxonomies only, never PII. */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            What you can query
          </h2>
          <p className="text-sm text-white/55">
            Approved keys return{" "}
            <span className="font-semibold text-white/80">counts and taxonomies</span> only — never
            names, emails, phones, or photos. Filtered counts below 5 are suppressed to protect a
            small community.
          </p>
          <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02] text-sm">
            {ENDPOINT_SUMMARY.map(([path, desc]) => (
              <div key={path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="break-all font-mono text-xs text-white/90">{path}</span>
                <span className="text-white/50 sm:ml-auto">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Link to the full public docs (kept for marketing + unauth). */}
        <section>
          <Link
            href="/developers"
            className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-amber-400/40 hover:bg-white/[0.05]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
              <IconCode className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                Full developer docs
                <IconArrowRight className="h-4 w-4 -translate-x-1 text-white/30 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-sm text-white/55">
                Every endpoint, filtering, OpenAPI spec, and Claude / MCP setup.
              </span>
            </span>
          </Link>
        </section>
      </div>
    </>,
  );
}
