import Image from "next/image";
import Link from "next/link";
import { KeyConsole } from "./key-console";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer API — Pixel Parents",
  description:
    "Build with the Pixel Parents API. Get a free key instantly for high-level community stats; request approval for richer non-PII data. Never returns names, emails, phones, children, or photos.",
};

// Hand-trimmed illustrative payloads so the response shape is obvious at a glance.
const EXAMPLE_STATS = `{
  "total_signups": 42,
  "total_children": 37,
  "updated_at": "2026-06-15T18:30:00.000Z",
  "database": "ready"
}`;

const EXAMPLE_BREAKDOWNS = `{
  "signups_by_state":       { "CA": 18, "WA": 6, "NY": 4 },
  "signups_by_affiliation": { "Existing parent (currently enrolled)": 22, "New parent …": 12 },
  "signups_by_tech_depth":  { "10x Developer": 9, "Vibe coder": 7 },
  "signups_by_skillset":    { "Frontend": 14, "Backend": 11, "AI LLM Wrangler": 8 },
  "children_by_grade":      { "9th": 11, "10th": 9, "11th": 8 },
  "top_interests": [ { "interest": "robotics", "count": 12 },
                     { "interest": "music", "count": 9 } ],
  "updated_at": "2026-06-15T18:30:00.000Z",
  "database": "ready"
}`;

const ENDPOINTS: Array<[string, string, string, "Public" | "Approved"]> = [
  ["GET", "/api/v1/stats", "High-level totals (signups, children, updated_at)", "Public"],
  ["GET", "/api/v1/me", "Your key's tier + approval status", "Public"],
  ["GET", "/api/v1/options", "Option taxonomies + interests pool (non-PII)", "Approved"],
  ["GET", "/api/v1/breakdowns", "Aggregate counts by state / affiliation / skillset / grade …", "Approved"],
];

export default function DevelopersPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-6 py-16 text-white sm:py-24">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        {/* Header */}
        <header className="flex flex-col items-center gap-6 text-center">
          <Link href="/" aria-label="Pixel Parents home" className="opacity-90 transition-opacity hover:opacity-100">
            <Image
              src="/images/pixel-mascot.png"
              alt="Pixel Parents mascot"
              width={934}
              height={918}
              priority
              className="h-auto w-24"
            />
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Build with the Pixel Parents API
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/60">
            A free, instant key gives you high-level community stats. We only ever return{" "}
            <span className="font-semibold text-white/80">counts and taxonomies</span> — never names,
            emails, phones, children, or photos.
          </p>
        </header>

        {/* Tiers */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Two tiers, one key</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Public</p>
              <p className="font-display text-2xl font-bold">Free &amp; instant</p>
              <p className="text-sm text-white/60">
                Self-serve below — no approval. Returns ultra-high-level aggregates only: total
                signups, total children, and a last-updated timestamp.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-white/70">Approved</p>
              <p className="font-display text-2xl font-bold">Request access</p>
              <p className="text-sm text-white/60">
                We manually upgrade your key. Unlocks richer <span className="text-white/80">non-PII</span>{" "}
                reads — option taxonomies and count breakdowns by state, affiliation, skillset, grade,
                and interests. Still no raw PII, ever.
              </p>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Endpoints</h2>
          <p className="text-sm text-white/50">
            Authenticate every call with <code className="font-mono text-xs text-white/70">Authorization: Bearer &lt;your-key&gt;</code>.
          </p>
          <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02] text-sm">
            {ENDPOINTS.map(([method, path, desc, tier]) => (
              <div key={path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-10 shrink-0 font-mono text-xs font-semibold text-emerald-300">{method}</span>
                <span className="break-all font-mono text-xs text-white/90">{path}</span>
                <span className="text-white/50 sm:ml-auto">{desc}</span>
                <span className={`text-xs ${tier === "Approved" ? "text-white/70" : "text-emerald-300/80"}`}>{tier}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Example responses */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Example responses</h2>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/60">
              <code className="font-mono text-xs text-white/80">GET /api/v1/stats</code> — public tier
            </p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-4 font-mono text-xs leading-relaxed text-white/80">
{EXAMPLE_STATS}
            </pre>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/60">
              <code className="font-mono text-xs text-white/80">GET /api/v1/breakdowns</code> — approved tier (counts only)
            </p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-4 font-mono text-xs leading-relaxed text-white/80">
{EXAMPLE_BREAKDOWNS}
            </pre>
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* Get a key */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold">Get a key</h2>
            <p className="text-sm text-white/60">
              Tell us who you are and what you&apos;re building. Your key works on the public endpoints
              immediately; we review requests and upgrade keys for the richer endpoints.
            </p>
          </div>
          <KeyConsole />
        </section>
      </div>
    </div>
  );
}
