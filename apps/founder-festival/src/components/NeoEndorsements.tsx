// Investor-profile surface for Neo (neo.com) endorsements.
//
// Neo flags a subject as a VC and the enricher records `numEndorsements` (a
// count) plus the profile `slug`. The endorsement QUOTE content is not
// fetchable via Neo's public API (the type is private and the page is a
// token-gated Bubble SPA), so rather than scrape it we deep-link out to the
// investor's Neo page where the community endorsements live. This is the
// zero-dependency surface; a future Phase 2 (headless-browser scrape into a
// `neo_endorsements` table) could replace the link with inline quotes.
//
// Pure presentational + server-safe: it only renders a heading and an external
// link. The parent gates rendering on `onNeo === true && neoSlug` so this
// component can assume it has a real slug.

export function neoInvestorUrl(slug: string): string {
  return `https://neo.com/investor/${encodeURIComponent(slug)}`;
}

export function NeoEndorsements({
  slug,
  firstName,
}: {
  slug: string;
  // Subject's first name for the copy ("Jane is endorsed…"). Falls back to a
  // generic phrasing when unknown.
  firstName?: string | null;
}) {
  const who = firstName?.trim() || "This investor";
  return (
    <section className="w-full flex flex-col gap-3">
      <h3 className="font-display text-xl font-bold text-zinc-100">Endorsements</h3>
      <p className="text-sm text-zinc-400">
        {who} is endorsed by the Neo community as a startup investor.
      </p>
      <a
        href={neoInvestorUrl(slug)}
        target="_blank"
        rel="noopener noreferrer"
        className="link text-sm self-start"
      >
        Read their endorsements on Neo →
      </a>
    </section>
  );
}
