import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AccountSetupForm } from "@/components/AccountSetupForm";
import { isUuid } from "@/lib/canonicalize";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ e?: string; claimed?: string; from?: string }>;
};

export default async function AccountSetupPage({ searchParams }: PageProps) {
  // Tolerate stale-Clerk-session (deleted user 404).
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/claim");

  const { e, claimed } = await searchParams;
  // Resolve the eval id to return to. Prefer the explicit `?e=`, but when it's
  // absent — e.g. the user arrived via the "complete your membership" banner,
  // which links to /account/setup with no `e` — fall back to their claimed
  // evaluation. This is what kept sending people to the home page after they
  // finished account setup.
  let evalId = e && isUuid(e) ? e : null;
  if (!evalId) {
    const { userId } = await auth();
    if (userId) {
      const [row] = await db
        .select({ evaluationId: users.evaluationId })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1);
      if (row?.evaluationId) evalId = row.evaluationId;
    }
  }
  // The next page we'll send them to once setup is done (or skipped). Carry the
  // `claimed=` signal through so /profile still shows the ClaimSuccessBanner.
  const next = evalId
    ? `/profile?e=${evalId}${claimed ? `&claimed=${encodeURIComponent(claimed)}` : ""}`
    : "/";

  return (
    <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-800">
        <a href="/?home=1" className="opacity-90 hover:opacity-100">
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="w-10 h-auto"
          />
        </a>
      </header>
      <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            One more step
          </h1>
        </div>
        <AccountSetupForm nextUrl={next} />
      </main>
    </div>
  );
}
