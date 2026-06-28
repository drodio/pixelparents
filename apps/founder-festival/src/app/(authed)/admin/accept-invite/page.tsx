// Landing page the admin-invite email link lands on.
//
// This page renders for EVERYONE (the /admin layout special-cases this path so
// the admin-access gate doesn't swallow it — an invitee isn't an admin yet).
// All the work happens client-side in <AcceptInvite/>:
//   - signed out → open Clerk sign-up (defaulting to sign-up, since invitees
//     are usually new), redirecting back here with the token preserved.
//   - signed in  → POST the token to the redeem API, which validates a verified
//     Clerk email matches the invited address and grants admin access.

import { AcceptInvite } from "@/components/admin/AcceptInvite";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ token?: string }> };

export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  if (!token || typeof token !== "string") {
    return (
      <div className="max-w-md mx-auto mt-20 px-6 text-center flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold">Invite missing</h1>
        <p className="text-zinc-400 text-sm">
          This page expects a <code>?token=…</code> parameter from your invite email.
        </p>
      </div>
    );
  }

  return <AcceptInvite token={token} />;
}
