import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { getRequestByClerkUser } from "@/lib/db/api-keys";
import { getSignupByEmail } from "@/lib/db/signups";
import { hasDatabase } from "@/lib/db";
import { shareFieldsOrDefault, coerceShareVisibility } from "@/lib/share";
import { shareUrlFor } from "@/lib/url";
import { ShareSettings } from "@/app/signup/thanks/share-settings";
import { KeyPanel } from "./key-panel";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your API access — Pixel Parents" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col bg-black px-6 py-16 text-white">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/developers" className="text-sm text-white/60 hover:text-white">
            ← Developer API
          </Link>
          <UserButton />
        </header>
        <h1 className="text-3xl font-semibold tracking-tight">Your API access</h1>
        {children}
      </div>
    </main>
  );
}

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) return null; // middleware redirects unauthenticated visitors

  if (!hasDatabase()) {
    return (
      <Shell>
        <p className="text-sm text-white/60">
          The API isn&apos;t fully configured yet. Please check back soon.
        </p>
      </Shell>
    );
  }

  const req = await getRequestByClerkUser(user.id);
  const status = req?.status ?? "none";

  // If this signed-in user also filled out the parent signup form (matched by
  // email), let them manage their secret share link right here too.
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;
  const signup = email ? await getSignupByEmail(email) : null;

  return (
    <Shell>
      {status === "approved" ? (
        <section className="flex flex-col gap-5">
          <KeyPanel hasKey={Boolean(req?.keyHash)} prefix={req?.keyPrefix ?? null} />
          <p className="text-sm text-white/50">
            Use it as <code className="font-mono text-xs text-white/80">Authorization: Bearer &lt;key&gt;</code>.
            Full endpoint docs are on the{" "}
            <Link href="/developers" className="text-emerald-300 hover:underline">
              Developer API page
            </Link>
            .
          </p>
        </section>
      ) : status === "pending" ? (
        <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <p className="font-semibold">Your request is under review ⏳</p>
          <p className="text-sm text-white/60">
            We review every request by hand. You&apos;ll get an email when it&apos;s approved, and
            your API key will show up right here.
          </p>
        </section>
      ) : status === "rejected" ? (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
            <p className="font-semibold text-red-300">This request wasn&apos;t approved</p>
            {req?.rejectReason && (
              <p className="text-sm text-white/70">Note: {req.rejectReason}</p>
            )}
            <p className="text-sm text-white/60">You&apos;re welcome to apply again below.</p>
          </div>
          <RequestForm />
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <p className="text-sm text-white/60">
            The Pixel Parents API is limited to OHS families. Tell us what you&apos;d like to build
            and we&apos;ll review your request.
          </p>
          <RequestForm />
        </section>
      )}

      {signup && (
        <section className="flex flex-col gap-4 border-t border-white/10 pt-8">
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
    </Shell>
  );
}
