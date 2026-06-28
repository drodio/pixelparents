// Global footer rendered on every page via the root layout. Deliberately
// understated: same small gray treatment as the "Have an invite code?" link,
// and the Chief link stays gray (not the usual gold) so it's a quiet credit
// rather than a loud CTA.
export function SiteFooter() {
  return (
    <footer className="mt-auto py-6 text-center text-xs text-zinc-500">
      Festival&apos;s intelligence is powered by{" "}
      <a
        href="https://Chief.bot"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300"
      >
        Chief
      </a>
    </footer>
  );
}
