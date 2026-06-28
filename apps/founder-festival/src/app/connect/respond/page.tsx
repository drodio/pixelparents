import Link from "next/link";
import { ConnectionRespond } from "@/components/events/ConnectionRespond";
import { getConnectionRequestByToken } from "@/lib/attendee-connections";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ token?: string; action?: string }> };

// Public landing for the approve/deny links in connection-request emails. Shows
// an explicit Confirm button (not a one-click GET) so email scanners can't
// auto-decide on the recipient's behalf.
export default async function ConnectRespondPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const action = sp.action === "approved" ? "approved" : sp.action === "denied" ? "denied" : null;

  // Resolve the requester's name so the heading names who's asking, e.g.
  // "Approve Jensen Huang's Connection Request". Falls back to a generic heading
  // when the token is unknown (already handled / invalid link). The name links to
  // their festival profile.
  const request = token ? await getConnectionRequestByToken(token) : null;
  const fromPath = request ? await canonicalProfileUrl(request.fromEvaluationId) : null;
  const verb = action === "denied" ? "Deny" : "Approve";

  return (
    <main className="min-h-screen bg-[#151515] text-zinc-100 px-4 py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <Link href="/" aria-label="Founder Festival home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/founder-festival-logo.png" alt="Founder Festival" className="w-14 h-auto" />
        </Link>
        <h1 className="font-display text-2xl font-bold">
          {request?.fromName ? (
            <>
              {verb}{" "}
              {fromPath ? (
                <a href={fromPath} className="text-[#dfa43a] underline hover:opacity-90">
                  {request.fromName}
                </a>
              ) : (
                request.fromName
              )}
              ’s Connection Request
            </>
          ) : (
            "Connection request"
          )}
        </h1>
        {!token || !action ? (
          <p className="text-red-400">This link is invalid or incomplete.</p>
        ) : (
          <ConnectionRespond token={token} action={action} />
        )}
      </div>
    </main>
  );
}
