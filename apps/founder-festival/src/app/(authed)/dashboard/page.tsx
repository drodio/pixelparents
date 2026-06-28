import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

export default async function DashboardPage() {
  // Tolerate a stale Clerk session that points at a deleted user — Clerk's
  // currentUser() throws a 404 in that case. Treat as signed-out.
  const user = await currentUser().catch(() => null);

  return (
    <div className="flex flex-col flex-1 px-6 sm:px-8 py-12 max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between mb-12">
        <a
          href="/?home=1"
          className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white"
        >
          ← festival.so
        </a>
        <UserButton />
      </header>
      <main className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          You&apos;re on the Founder Festival list. We&apos;ll be in touch with
          details soon.
        </p>
      </main>
    </div>
  );
}
