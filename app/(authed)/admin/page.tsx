import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

// proxy.ts already guarantees the visitor is signed in. This page adds an
// allowlist on top so being signed in isn't enough — only emails listed in
// ADMIN_EMAILS (comma-separated) reach the admin tools. Set it in Vercel +
// .env.local. If unset, no one is treated as admin (fail closed).
function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

export default async function AdminPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const admin = isAdminEmail(email);

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <UserButton />
      </header>

      {admin ? (
        <section className="rounded-lg border border-white/10 p-6">
          <p>
            Signed in as <strong>{email}</strong>. Admin tools go here.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-6">
          <p>
            You&rsquo;re signed in as <strong>{email ?? "unknown"}</strong>, but
            this account isn&rsquo;t on the admin allowlist.
          </p>
        </section>
      )}
    </main>
  );
}
