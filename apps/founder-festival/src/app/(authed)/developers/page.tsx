import Link from "next/link";
import { DeveloperConsole } from "@/components/developers/DeveloperConsole";
import { getEstimateCents } from "@/lib/admin";
import { applyMarkup } from "@/lib/credit-pricing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer API — Founder Festival",
  description:
    "Build the Founder Festival scoring rubric into your own application. Register, generate an API key, and start scoring founders and investors.",
};

// Illustrative shape for the docs. Hand-trimmed (arrays shortened) so a reader
// grasps the full surface without scrolling a real 300-line payload.
const EXAMPLE_SCORE_RESPONSE = `{
  "linkedin_url": "https://www.linkedin.com/in/example",
  "full_name": "Jane Q Founder",
  "company_name": "Acme", "company_url": "https://acme.com",
  "profile_href": "/profile/jane", "avatar_url": "https://…", "claimed": true,
  "location": { "city": "San Francisco", "region": "CA", "country": "USA" },
  "signal_quality": "high",
  "scores": {
    "overall":  { "score": 530, "percentile": 92 },
    "founder":  { "score": 410, "percentile": 95 },
    "investor": { "score": 120, "percentile": 61 }
  },
  "founder_status": "current", "investor_status": "past",
  "badges": ["yc", "unicorn", "raised"],
  "canonical_industries": ["ai-ml", "fintech"],
  "outcome": { "had_ipo": false, "had_acquisition": true, "is_unicorn": true,
               "ipo_market_cap_usd": null, "acquisition_price_usd": 250000000 },
  "investor": { "stage_focus": ["seed","series-a"], "industry_focus": ["fintech"],
                "leads_rounds": true, "check_size": { "min_usd": 250000, "max_usd": 1000000 } },
  "neo": { "on_neo": true, "slug": "jane-q" },
  "founder_rows": [ { "reason": "Scaled to 200 employees",
                      "confidence": 90, "status": "confirmed" } ],
  "what_you_likely_need": { "text": "Raise a Series A.", "status": "likely", "confidence": 80 },
  "current_priorities": [ { "id": "p1", "text": "Hire a VP Eng",
                            "category": "hiring", "rating": 4, "private": false } ],
  "credibility": {
    "founder": [ { "key": "technical", "label": "Technical Depth", "axis_label": "Technical",
                   "score": 88, "coverage": true,
                   "evidence": [ { "reason": "Built core ML platform" } ] } ],
    "investor": null
  },
  "matrix": {
    "founder": {
      "similar":    [ { "full_name": "Sam O", "profile_href": "/profile/sam",
                        "avatar_url": "https://…", "display_score": 480 } ],
      "complement": [ /* … */ ],
      "opposite":   [ /* … */ ]
    },
    "investor": null
  },
  "scored_at": "2026-05-20T12:00:00.000Z", "cached": true,
  "cost": { "charged_cents": 0, "basis": "cached" }
}`;

export default async function DevelopersPage() {
  // What a developer pays to score a NEW profile = 10× our rolling measured cost
  // (median of recent evals via getEstimateCents). Existing lookups are free.
  const avgScoreCents = applyMarkup(await getEstimateCents("sonnet"));
  return (
    <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100 px-6 py-16 sm:py-24">
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-10">
        {/* Centered logo + title, /chatham look and feel. */}
        <header className="flex flex-col items-center gap-6 text-center">
          <Link
            href="/?home=1"
            aria-label="Founder Festival home"
            className="opacity-90 hover:opacity-100 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* Small intrinsic width (not the logo's full 498px) so it can't
                blow up if the width utility ever fails to apply. */}
            <img
              src="/images/founder-festival-logo.png"
              alt="Founder Festival"
              width={68}
              height={61}
              className="w-[68px] h-auto"
            />
          </Link>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Want to build something awesome with our Festival API?
          </h1>
        </header>

        {/* Stay in the loop on what we ship. */}
        <div className="flex justify-center">
          <Link
            href="/changelog"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#dfa43a]/50 px-4 py-1.5 text-sm font-semibold text-[#dfa43a] transition hover:bg-[#dfa43a]/10"
          >
            Subscribe to our Changelog &rarr;
          </Link>
        </div>

        {/* Body — left-aligned for readability. */}
        <div className="flex flex-col gap-4 text-zinc-300 text-base leading-relaxed">
            <p className="font-semibold text-zinc-100">
              Build our founder &amp; investor scoring rubric into your own application.
            </p>
            <p>Existing profiles are free to look up. Pay to score new ones.</p>
            <p>
              Everything the API returns is <span className="font-semibold text-zinc-100">public profile data</span>
              {" "}— exactly what a visitor sees on the site. It never returns emails, phone numbers, or anything a
              person marked private.
            </p>
            <p className="font-semibold text-zinc-100">A profile lookup returns the whole public picture:</p>

            <ul className="list-disc pl-5 space-y-3 marker:text-zinc-500">
              <li>
                <span className="font-semibold text-zinc-100">Composite + individual founder &amp; investor scores</span>
                {" "}— each dimension&apos;s score plus the person&apos;s percentile rank, and a current / past / never status marker.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Score breakdown</span>
                {" "}— the individual founder and investor signals behind each score, each with a confidence level and human-confirmation status.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Credibility radar</span>
                {" "}— the spider-graph axes (technical, traction, operator, domain, GTM for founders; portfolio, exits, firm, experience, capital for investors), percentile-ranked, with the evidence behind each axis.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Peer matrix</span>
                {" "}— who&apos;s <em>most like</em>, <em>most complementary to</em>, and <em>least like</em> this person.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Badges, industries &amp; outcomes</span>
                {" "}— achievement badges, normalized industry tags, and traction facts (IPO / acquisition / unicorn).
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Investor focus</span>
                {" "}— stage focus, industry focus, check size, and whether they lead rounds.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Guidance</span>
                {" "}— a plain-language &ldquo;what they likely need&rdquo; summary and recommended priorities tagged by category.
              </li>
              <li>
                <span className="font-semibold text-zinc-100">Identity</span>
                {" "}— name, company (+ link), profile photo and location for claimed profiles, signal quality, and claimed status.
              </li>
            </ul>

            <p className="font-semibold text-zinc-100 pt-2">Plus endpoints to explore the whole dataset:</p>
            <ul className="list-disc pl-5 space-y-2 marker:text-zinc-500">
              <li><span className="font-semibold text-zinc-100">Resolve</span> a name (+ company) to ranked LinkedIn candidates.</li>
              <li><span className="font-semibold text-zinc-100">Search</span> scored people by name or company.</li>
              <li><span className="font-semibold text-zinc-100">Leaderboard</span> — filter by role, industry, stage, outcome, badges, amount raised, and team size; paginated.</li>
              <li><span className="font-semibold text-zinc-100">Events</span> — published qualifying events.</li>
              <li><span className="font-semibold text-zinc-100">Industries</span> — the canonical industry taxonomy.</li>
            </ul>

            <div className="text-center pt-3">
              <p className="font-semibold text-zinc-100">Cost per profile:</p>
              {/* Smaller gap on narrow phones so the FREE / $X.XX columns
                  don't crowd; widens to the original 50px from sm up. */}
              <div className="flex justify-center gap-8 sm:gap-[50px] mt-3">
                <div>
                  <p className="font-display text-3xl font-bold text-[#dfa43a] tabular-nums">
                    FREE
                  </p>
                  <p className="text-zinc-400 mt-1">Existing profiles</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-bold text-[#dfa43a] tabular-nums">
                    ${(avgScoreCents / 100).toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-1">New profiles</p>
                </div>
              </div>
            </div>
        </div>

        {/* Endpoint reference — quick scan of the full surface area. */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold text-zinc-100">Endpoints</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800 text-sm">
            {[
              ["GET", "/api/v1/resolve?name=&company=", "Name → ranked LinkedIn candidates", "Free"],
              ["GET", "/api/v1/score?linkedin_url=", "Full public profile (cached)", "Free"],
              ["POST", "/api/v1/score", "Score a new person on demand", "Credits"],
              ["GET", "/api/v1/search?q=", "Search scored people by name / company", "Free"],
              ["GET", "/api/v1/leaderboard", "Filterable, paginated leaderboard", "Free"],
              ["GET", "/api/v1/events", "Published events", "Free"],
              ["GET", "/api/v1/events/{slug}", "One published event", "Free"],
              ["GET", "/api/v1/industries", "Canonical industry taxonomy", "Free"],
              ["GET", "/api/v1/credits", "Your remaining credit balance", "Free"],
            ].map(([method, path, desc, cost]) => (
              <div key={path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-mono text-xs font-semibold text-[#dfa43a] w-11 shrink-0">{method}</span>
                <span className="font-mono text-xs text-zinc-200 break-all">{path}</span>
                <span className="text-zinc-400 sm:ml-auto">{desc}</span>
                <span className={`text-xs ${cost === "Credits" ? "text-[#dfa43a]" : "text-zinc-500"}`}>{cost}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Example response — so the shape is obvious at a glance. */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold text-zinc-100">Example profile response</h2>
          <p className="text-zinc-400 text-sm">
            Abbreviated <code className="font-mono text-xs text-zinc-300">GET /api/v1/score</code> response — arrays
            trimmed for brevity.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre">
{EXAMPLE_SCORE_RESPONSE}
          </pre>
        </div>

        <div className="border-t border-zinc-800" />

        {/* Interactive console — gets started heading from here so layout is clear */}
        <section className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-bold text-zinc-100">
            Here&apos;s how to get started:
          </h2>
          <DeveloperConsole />
        </section>
      </div>
    </div>
  );
}
