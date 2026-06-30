// Connect-mode profile body: a warm, NON-competitive info block shown in place
// of the founder/investor scores + ScoreTable when CONNECT_MODE is on.
//
// Surfaces (all optional — renders only what exists):
//   - a short neutral bio (the connect-mode info pass stores it in
//     credibilityTitle; the page passes it here),
//   - "Areas of expertise / how they can help" — the person's OFFER to the
//     community (reused from the recommendations slot, reframed),
// Expertise/topic TAGS are already rendered by the existing Industries badge
// group on the profile, so they are intentionally NOT duplicated here.
//
// Purely presentational — no fetching, no scores, no rankings.

type HelpItem = { id: string; text: string; category?: string | null };

export function ConnectExpertiseSection({
  bio,
  items,
}: {
  bio: string | null;
  items: HelpItem[];
}) {
  const hasBio = !!bio && bio.trim().length > 0;
  const hasItems = items.length > 0;
  if (!hasBio && !hasItems) return null;

  return (
    <section className="w-full flex flex-col gap-5" aria-labelledby="connect-about-heading">
      {hasBio && (
        <div className="flex flex-col gap-2">
          <h2 id="connect-about-heading" className="font-display text-lg font-bold tracking-tight">
            About
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">{bio}</p>
        </div>
      )}

      {hasItems && (
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold tracking-tight">
            Areas of expertise &amp; how they can help
          </h2>
          <ul className="flex flex-col gap-1.5">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#dfa43a]" aria-hidden />
                <span>{it.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
