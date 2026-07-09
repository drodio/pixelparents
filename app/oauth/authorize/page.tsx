import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { getClientByClientId, getConsent } from "@/lib/oauth/store";
import { validateAuthorize, type AuthorizeParams } from "@/lib/oauth/authorize";
import { isOhsVerified, roleOf } from "@/lib/oauth/claims";
import { SCOPE_DESCRIPTIONS } from "@/lib/oauth/config";
import { isClientLive } from "@/lib/oauth/gating";
import { ownerApiAccessApproved } from "@/lib/oauth/owner-approval";
import { consentCovers } from "@/lib/oauth/consent";
import { decideConsent, issueCodeForRememberedConsent } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in with GoPixel",
  robots: { index: false, follow: false },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// Rebuild the current authorize URL (with query) to resume after sign-in.
function selfUrl(p: AuthorizeParams): string {
  const u = new URL("/oauth/authorize", "http://placeholder");
  for (const [k, val] of Object.entries(p)) if (val) u.searchParams.set(k, String(val));
  return u.pathname + u.search;
}

// GET /oauth/authorize — the OAuth authorization endpoint + consent screen.
// Clerk-gated (bounces to /sign-in when signed out, resuming here afterwards),
// validates the request, then renders a minimal Allow/Deny consent screen listing
// the requesting app + the scopes. Allow/Deny is handled by the decideConsent
// server action, which issues the code and redirects back.
export default async function AuthorizePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params: AuthorizeParams = {
    client_id: one(sp.client_id),
    redirect_uri: one(sp.redirect_uri),
    response_type: one(sp.response_type),
    scope: one(sp.scope),
    state: one(sp.state),
    nonce: one(sp.nonce),
    code_challenge: one(sp.code_challenge),
    code_challenge_method: one(sp.code_challenge_method),
  };

  // 1. Require a Clerk session. Signed out → through the app's existing sign-in,
  //    then back to this exact authorize request.
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(selfUrl(params))}`);
  }

  // 2. Validate the request against the live client record.
  const client = params.client_id ? await getClientByClientId(params.client_id) : null;
  const v = validateAuthorize(params, client);

  if (!v.ok) {
    if (v.kind === "redirect") {
      // Reportable error → bounce back to the registered redirect_uri.
      const u = new URL(v.redirectUri);
      u.searchParams.set("error", v.error);
      if (v.state) u.searchParams.set("state", v.state);
      redirect(u.toString());
    }
    // Fatal → render an inline error (never redirect to an unverified URI).
    return <ErrorCard title="This sign-in request can't be completed" message={v.description} />;
  }

  // 3. APPROVAL GATE (top V1 ask): the app must be LIVE — approved either by an
  //    admin approving the client, or by the owning developer's API access being
  //    approved. Until then, show a clear "pending approval" state and DO NOT issue
  //    a code. (/token enforces the same gate independently.)
  const ownerApproved = await ownerApiAccessApproved(v.client.created_by);
  if (!isClientLive(v.client, ownerApproved)) {
    return (
      <PendingCard
        appName={v.client.name}
        rejected={v.client.status === "rejected"}
        reason={v.client.reject_reason}
      />
    );
  }

  // 4. Resolve the signed-in user for the consent screen + the verified badge.
  const user = await currentUser();
  const email = primaryEmail(user);
  const signup = email ? await getSignupByEmail(email) : null;
  const verified = isOhsVerified(signup);
  const isStudent = roleOf(signup) === "student";
  // Prefer a real name; if none exists, fall back to the email's local part
  // (the bit before "@") rather than exposing the full raw address on a screen a
  // third-party app initiated. "your account" is the last resort.
  const emailLocalPart = email ? (email.split("@")[0] || null) : null;
  const displayName =
    signup?.firstName ?? user?.firstName ?? emailLocalPart ?? "your account";

  // 5. REMEMBERED CONSENT: if the user already granted this client a scope set that
  //    covers what's being requested, skip the screen and issue the code directly
  //    ("Continue as …"). Any NEW scope re-prompts (consentCovers is a superset
  //    check). The server action re-validates + re-gates before issuing.
  const remembered = await getConsent(userId!, v.client.client_id);
  if (consentCovers(remembered?.scope, v.scopes)) {
    await issueCodeForRememberedConsent({
      client_id: v.client.client_id,
      redirect_uri: v.redirectUri,
      response_type: "code",
      scope: v.scopes.join(" "),
      state: v.state,
      nonce: v.nonce,
      code_challenge: v.codeChallenge,
      code_challenge_method: "S256",
    });
  }

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
          Sign in with GoPixel
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-white">
          {v.client.name} wants to sign you in
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Continuing as <span className="font-medium text-white/90">{displayName}</span>
          {verified ? (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Verified OHS
            </span>
          ) : null}
        </p>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            This app will be able to
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {v.scopes.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm text-white/80">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{SCOPE_DESCRIPTIONS[s]}</span>
              </li>
            ))}
          </ul>
        </div>

        {isStudent ? (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
            This app will learn that you&apos;re a verified OHS student
            {v.scopes.includes("grade_band")
              ? " and whether you're in middle or high school (never your exact grade)"
              : ""}
            .
          </p>
        ) : null}

        {!verified && v.scopes.includes("ohs_verified") ? (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
            Heads up: your OHS membership isn&apos;t verified yet, so this app will
            be told you are not verified. Verify your family to assert OHS status.
          </p>
        ) : null}

        <form className="mt-7 flex flex-col gap-3">
          {/* Carry the validated request forward; the action re-validates it. */}
          <input type="hidden" name="client_id" value={v.client.client_id} />
          <input type="hidden" name="redirect_uri" value={v.redirectUri} />
          <input type="hidden" name="response_type" value="code" />
          <input type="hidden" name="scope" value={v.scopes.join(" ")} />
          {v.state ? <input type="hidden" name="state" value={v.state} /> : null}
          {v.nonce ? <input type="hidden" name="nonce" value={v.nonce} /> : null}
          <input type="hidden" name="code_challenge" value={v.codeChallenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />

          <button
            type="submit"
            name="decision"
            value="allow"
            formAction={decideConsent}
            className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
          >
            Allow
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            formAction={decideConsent}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5"
          >
            Deny
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-white/35">
          You&apos;ll be returned to {hostOf(v.redirectUri)}. Only allow apps you trust.
        </p>
      </div>
    </main>
  );
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return "the app";
  }
}

// Shown when the app is registered but NOT yet live (pending approval) or was
// rejected. We never issue a code in this state.
function PendingCard({
  appName,
  rejected,
  reason,
}: {
  appName: string;
  rejected: boolean;
  reason: string | null;
}) {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-amber-200">
          {rejected ? "This app isn't approved" : "This app is pending approval"}
        </h1>
        <p className="mt-2 text-sm text-white/70">
          {rejected ? (
            <>
              <span className="font-medium text-white/90">{appName}</span> can&apos;t sign you
              in. Its access to GoPixel was not approved.
              {reason ? <span className="mt-1 block text-white/50">Note: {reason}</span> : null}
            </>
          ) : (
            <>
              <span className="font-medium text-white/90">{appName}</span> is registered with
              GoPixel but is still under review. Sign-in apps go live once we&apos;ve
              vetted the developer — especially for apps that see OHS students&apos; data. Check
              back soon.
            </>
          )}
        </p>
        <p className="mt-4 text-xs text-white/40">
          If this is your app, you&apos;ll see its status in the Developers tab.
        </p>
      </div>
    </main>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-red-300">{title}</h1>
        <p className="mt-2 text-sm text-white/70">{message}</p>
        <p className="mt-4 text-xs text-white/40">
          If you reached this from an app, contact that app&apos;s developer — the
          sign-in request was misconfigured.
        </p>
      </div>
    </main>
  );
}
