import Image from "next/image";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isAdminEmail } from "@/lib/admin";
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
        <div className="flex">
          <aside className="w-48 shrink-0 border-r border-white/10 p-4">
            <AdminNav />
          </aside>
          <div className="min-w-0 flex-1 p-6">{children}</div>
        </div>
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
