import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer API — Pixel Parents",
  description:
    "Build with the Pixel Parents API. Request access (OHS families only); once approved, your key unlocks high-level, non-PII community stats. Never returns names, emails, phones, or photos.",
};

// Hand-trimmed illustrative payloads so the response shape is obvious at a glance.
const EXAMPLE_STATS = `{
  "total_signups": 42,
  "total_families": 42,
  "total_children": 57,
  "updated_at": "2026-06-15T18:30:00.000Z",
  "database": "ready"
}`;

const EXAMPLE_BREAKDOWNS = `{
  "signups_by_state":           { "California": 18, "Washington": 6, "New York": 4 },
  "signups_by_country":         { "United States": 31, "Canada": 5, "India": 4 },
  "signups_by_affiliation":     { "Existing parent (currently enrolled)": 22, "New parent …": 12 },
  "signups_by_tech_depth":      { "10x Developer": 9, "Vibe coder": 7 },
  "signups_by_time_commitment": { "1-2hr/wk": 14, "2-5hr/wk": 11 },
  "signups_by_skillset":        { "Frontend": 14, "Backend": 11, "AI LLM Wrangler": 8 },
  "signups_by_builder_interest":{ "builder": 19, "aspiring": 14, "no": 9 },
  "signups_by_grade":           { "9th": 11, "10th": 9, "11th": 8 },
  "skillsets_by_tech_depth":    { "10x Developer": { "Backend": 6, "AI LLM Wrangler": 5 } },
  "top_interests": [ { "interest": "robotics", "count": 12 },
                     { "interest": "music", "count": 9 } ],
  "updated_at": "2026-06-15T18:30:00.000Z",
  "database": "ready"
}`;

const ENDPOINTS: Array<[string, string, string]> = [
  ["GET", "/api/v1", "Discovery index — no key needed"],
  ["GET", "/api/v1/health", "Liveness + version — no key needed"],
  ["GET", "/api/v1/openapi.json", "OpenAPI 3.1 spec — no key needed"],
  ["GET", "/api/v1/me", "Confirms your key is valid"],
  ["GET", "/api/v1/stats", "High-level totals — filterable"],
  ["GET", "/api/v1/breakdowns", "Counts by state / affiliation / tech depth / time / skillset / grade — filterable"],
  ["GET", "/api/v1/trends", "Signups over time (?interval=week|month)"],
  ["GET", "/api/v1/options", "Option taxonomies + interests pool (non-PII)"],
  ["POST", "/api/mcp", "MCP server — query the data from an AI agent"],
];

const STEPS: Array<[string, string]> = [
  ["1. Request access", "Create an account and tell us what you want to build."],
  ["2. We review it", "We approve requests from OHS families by hand — you'll get an email."],
  ["3. Build", "Once approved, reveal your API key and start calling the endpoints."],
];

const CLAUDE_MCP_CONFIG = `{
  "mcpServers": {
    "pixel-parents": {
      "url": "https://pixelparents.org/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}`;

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
          <div className="text-red-500">
            <p className="text-base font-semibold">
              This API is limited to use by OHS families only
            </p>
            <p className="text-base font-normal">
              Encourage your child(ren) to code (or vibe code!) something fun with this API!
            </p>
          </div>
          <p className="max-w-xl text-base leading-relaxed text-white/60">
            Once approved, your key returns{" "}
            <span className="font-semibold text-white/80">counts and taxonomies</span> only — never any
            PII like names, emails, phones, or photos.
          </p>
          <Link
            href="/sign-in?redirect_url=/account"
            className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            Request API access →
          </Link>
        </header>

        {/* How it works */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">How access works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map(([title, body]) => (
              <div key={title} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <p className="font-semibold text-emerald-300">{title}</p>
                <p className="text-sm text-white/60">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Endpoints */}
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Endpoints</h2>
          <p className="text-sm text-white/50">
            Most endpoints require an approved key (the discovery, health, and OpenAPI
            endpoints are public). Authenticate with{" "}
            <code className="font-mono text-xs text-white/70">Authorization: Bearer &lt;your-key&gt;</code>.
          </p>
          <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02] text-sm">
            {ENDPOINTS.map(([method, path, desc]) => (
              <div key={path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-10 shrink-0 font-mono text-xs font-semibold text-emerald-300">{method}</span>
                <span className="break-all font-mono text-xs text-white/90">{path}</span>
                <span className="text-white/50 sm:ml-auto">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Example responses */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Example responses</h2>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/60">
              <code className="font-mono text-xs text-white/80">GET /api/v1/stats</code>
            </p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-4 font-mono text-xs leading-relaxed text-white/80">
{EXAMPLE_STATS}
            </pre>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/60">
              <code className="font-mono text-xs text-white/80">GET /api/v1/breakdowns</code> — counts only
            </p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-4 font-mono text-xs leading-relaxed text-white/80">
{EXAMPLE_BREAKDOWNS}
            </pre>
          </div>
        </section>

        {/* Filtering, trends & tooling */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Filtering, trends &amp; tooling</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-white/60">
            <li>
              <span className="font-semibold text-white/80">Filter any aggregate</span> with query params, e.g.{" "}
              <code className="font-mono text-xs text-white/80">/api/v1/breakdowns?state=CA&amp;tech_depth=10x%20Developer</code>
              . To protect a small community, filtered counts below 5 are suppressed.
            </li>
            <li>
              <span className="font-semibold text-white/80">Track growth</span> with{" "}
              <code className="font-mono text-xs text-white/80">/api/v1/trends?interval=week</code> — signups over
              time plus a running cumulative.
            </li>
            <li>
              <span className="font-semibold text-white/80">Generate a typed client</span> from the{" "}
              <a href="/api/v1/openapi.json" className="text-emerald-300 hover:underline">
                OpenAPI 3.1 spec
              </a>
              .
            </li>
            <li>
              <span className="font-semibold text-white/80">Query from an AI agent</span> — point any MCP client at{" "}
              <code className="font-mono text-xs text-white/80">/api/mcp</code> (tools:{" "}
              <code className="font-mono text-xs text-white/70">community_stats</code>,{" "}
              <code className="font-mono text-xs text-white/70">community_breakdowns</code>,{" "}
              <code className="font-mono text-xs text-white/70">community_trends</code>,{" "}
              <code className="font-mono text-xs text-white/70">community_options</code>).
            </li>
          </ul>
        </section>

        {/* Connect to Claude / AI agents */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Connect to Claude</h2>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
            <p className="text-sm text-white/70">
              The API also speaks <span className="font-semibold text-white/90">MCP</span> (Model
              Context Protocol), so you can ask Claude (or any AI agent) about the community in plain
              language. Point your MCP client at:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-xs text-emerald-200">
https://pixelparents.org/api/mcp
            </pre>
            <p className="mt-4 text-sm text-white/60">
              For Claude Desktop, add this to your{" "}
              <code className="font-mono text-xs text-white/80">claude_desktop_config.json</code>:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-xs leading-relaxed text-white/80">
{CLAUDE_MCP_CONFIG}
            </pre>
            <p className="mt-3 text-xs text-white/45">
              Discovery (listing tools) is open; calling a tool needs your approved key. Tools:{" "}
              <code className="font-mono text-white/70">community_stats</code>,{" "}
              <code className="font-mono text-white/70">community_breakdowns</code>,{" "}
              <code className="font-mono text-white/70">community_trends</code>,{" "}
              <code className="font-mono text-white/70">community_options</code>.
            </p>
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* CTA */}
        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-bold">Ready to build?</h2>
          <p className="max-w-md text-sm text-white/60">
            Create an account, tell us what you&apos;re building, and we&apos;ll review your request.
          </p>
          <Link
            href="/sign-in?redirect_url=/account"
            className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            Request API access →
          </Link>
        </section>
      </div>
    </div>
  );
}
