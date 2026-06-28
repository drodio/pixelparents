// Friendly admin gate shown to signed-in users who aren't on the
// ADMIN_EMAILS allowlist. Admin pages render this (return <NotAuthorized/>)
// instead of letting requireAdmin() throw a raw 403, so a non-admin who lands
// on an /admin URL gets a clear message rather than Next's error overlay.
export function NotAuthorized({ email }: { email?: string | null }) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-20 text-center gap-5">
      <img
        src="/images/founder-festival-logo.png"
        alt="Founder Festival"
        width={498}
        height={444}
        className="w-14 h-auto opacity-90"
      />
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
        You&apos;re not an authorized admin
      </h1>
      <p className="max-w-md text-zinc-400">
        This area is limited to Founder Festival organizers.
        {email ? (
          <>
            {" "}
            You&apos;re signed in as <span className="text-zinc-200">{email}</span>,
            which isn&apos;t on the admin allowlist.
          </>
        ) : null}
      </p>
      <a href="/?home=1" className="link text-sm mt-1">
        ← Back to the start
      </a>
    </div>
  );
}
