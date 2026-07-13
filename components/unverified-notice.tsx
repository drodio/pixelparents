import Link from "next/link";
import type { ApprovalStatus } from "@/lib/approval";
import { IconBan, IconGradCap } from "@/components/icons";

// Non-breaking banner shown to families who haven't verified their OHS student
// yet. It informs + links to /verify; it never blocks access (the 18 families who
// signed up before verification existed keep full access). Renders nothing once
// the family is approved.
export function UnverifiedNotice({ status }: { status: ApprovalStatus }) {
  if (status === "approved") return null;

  const denied = status === "denied";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] px-5 py-4">
      {denied ? (
        <IconBan className="h-5 w-5 shrink-0 text-amber-300" />
      ) : (
        <IconGradCap className="h-5 w-5 shrink-0 text-amber-300" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {denied ? "Your family's access was declined" : "Your OHS student isn't verified yet"}
        </p>
        <p className="mt-0.5 text-sm text-white/60">
          {denied
            ? "Reach out to a GoPixel admin if you think this is a mistake."
            : "Verify your student's Stanford email to confirm you're an OHS family. It takes about a minute."}
        </p>
      </div>
      {!denied && (
        <Link
          href="/verify"
          className="shrink-0 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          Verify now
        </Link>
      )}
    </div>
  );
}
