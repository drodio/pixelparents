import Image from "next/image";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isAdminEmail } from "@/lib/admin";
import { openReportCount } from "@/lib/db/reports";
import { IconLock } from "@/components/icons";
import AdminNav from "./admin-nav";

// Reads live auth on every request — never statically cached.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  const admin = await isAdminEmail(email);
  // Open-report count for the nav badge — only fetched for admins (cheap COUNT),
  // and self-healing if the table doesn't exist yet (falls back to 0).
  const openReports = admin ? await openReportCount().catch(() => 0) : 0;

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link
          href="/admin"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/images/pixel-mascot.png"
            alt="Pixel Parents"
            width={50}
            height={50}
            className="h-[50px] w-[50px]"
          />
          <span className="text-lg font-semibold tracking-tight">
            Pixel Parents Admin
          </span>
        </Link>
        <UserButton appearance={clerkAppearance} />
      </header>

      {admin ? (
        <>
          {/* Why-am-I-seeing-this banner: makes it unambiguous that the admin
              area (and any restricted content within) is visible *because* this
              account is an admin — not a leak. Subtle dark/amber, on theme. */}
          <div className="border-b border-amber-400/20 bg-amber-400/[0.07] px-6 py-2.5">
            <p className="flex items-center gap-2 text-xs text-amber-200/90">
              <IconLock className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span>
                You can see this because you&rsquo;re an admin
                {email ? (
                  <>
                    {" "}
                    (<span className="font-medium">{email}</span>)
                  </>
                ) : null}
                . This area and its restricted content aren&rsquo;t visible to
                regular families.
              </span>
            </p>
          </div>
          <div className="flex">
            <aside className="w-48 shrink-0 border-r border-white/10 p-4">
              <AdminNav openReports={openReports} />
            </aside>
            <div className="min-w-0 flex-1 p-6">{children}</div>
          </div>
        </>
      ) : (
        <main className="mx-auto max-w-2xl p-8">
          <section className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-6 text-sm">
            You&rsquo;re signed in as <strong>{email ?? "unknown"}</strong>, but
            this account isn&rsquo;t an admin. Ask an existing admin to add your
            email.
          </section>
        </main>
      )}
    </div>
  );
}
