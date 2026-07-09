import Link from "next/link";
import { PixelMascot } from "@/components/pixel-mascot";

export const metadata = {
  title: "Docs — GoPixel",
  description:
    "A curated index of GoPixel developer docs: Sign in with GoPixel (OIDC), the public /api/v1 community-stats API and how to request access, and how to contribute to the open-source repo.",
};

const REPO_URL = "https://github.com/drodio/pixelparents";
const SIGNIN_DOC_URL =
  "https://github.com/drodio/pixelparents/blob/main/docs/sign-in-with-pixelparents.md";

// Shared amber dotted-underline link styling, matching the /builders page accent.
const linkClass =
  "text-inherit underline decoration-dotted decoration-amber-400 underline-offset-2 transition-colors hover:decoration-amber-300";

// The public, key-gated REST surface. Mirrors app/api/v1/route.ts (the live
// discovery index) — kept short here on purpose; /api/v1/openapi.json is the
// machine-readable source of truth.
const API_ENDPOINTS: Array<[string, string, string]> = [
  ["GET", "/api/v1", "Discovery index — no key needed"],
  ["GET", "/api/v1/health", "Liveness + version — no key needed"],
  ["GET", "/api/v1/openapi.json", "OpenAPI 3.1 spec — no key needed"],
  ["GET", "/api/v1/me", "Confirms your key is valid"],
  ["GET", "/api/v1/stats", "High-level totals (filterable)"],
  ["GET", "/api/v1/breakdowns", "Counts by dimension (filterable)"],
  ["GET", "/api/v1/trends", "Signups over time (?interval=week|month)"],
  ["GET", "/api/v1/options", "Taxonomies + interests pool"],
  ["POST", "/api/mcp", "MCP server — query the data from an AI agent"],
];

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-6 py-16 text-white sm:py-24">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        {/* Header */}
        <header className="flex flex-col items-center gap-6 text-center">
          <PixelMascot widthClass="w-24" href="/" />
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Docs
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-white/70">
              A short, curated index of everything a builder needs to integrate
              with GoPixel — sign-in, the public API, and how to
              contribute. Everything links back to the open-source repo.
            </p>
          </div>
        </header>

        {/* Sign in with GoPixel */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Sign in with GoPixel</h2>
          <p className="text-base leading-relaxed text-white/70">
            A &ldquo;Sign in with Google&rdquo;-style identity button with one
            thing Google can&apos;t give you: a cryptographically signed,
            verified-OHS-identity claim (<code className="font-mono text-xs text-white/70">ohs_verified</code>).
            It&apos;s a thin OpenID Connect provider (OAuth 2.0 Authorization
            Code + PKCE S256) layered on the app&apos;s existing login.
          </p>
          <p className="text-base leading-relaxed text-white/70">
            Three ways to integrate, easiest first: a zero-npm drop-in{" "}
            <code className="font-mono text-xs text-white/70">&lt;script&gt;</code>{" "}
            button, the typed{" "}
            <code className="font-mono text-xs text-white/70">@pixelparents/auth</code>{" "}
            npm SDK, or any spec-compliant OIDC client pointed at the discovery
            document. Register your app and get a{" "}
            <code className="font-mono text-xs text-white/70">client_id</code> /{" "}
            <code className="font-mono text-xs text-white/70">client_secret</code>{" "}
            from the Developers tab.
          </p>
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">
              Full guide
            </p>
            <p className="text-base leading-relaxed text-white/70">
              The complete reference — endpoints, the flow diagram, all three
              integration tiers with code, scopes &amp; claims, the security
              model, and the MVP-vs-v1 roadmap — lives in the repo:
            </p>
            <a href={SIGNIN_DOC_URL} className={linkClass}>
              docs/sign-in-with-pixelparents.md →
            </a>
          </div>
        </section>

        {/* Public API */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">The public API</h2>
          <p className="text-base leading-relaxed text-white/70">
            The <code className="font-mono text-xs text-white/70">/api/v1/*</code>{" "}
            REST surface returns high-level, non-PII community stats — counts and
            taxonomies only. It never returns names, emails, phones, or photos.
            Most endpoints require an approved key; authenticate with{" "}
            <code className="font-mono text-xs text-white/70">
              Authorization: Bearer &lt;your-key&gt;
            </code>
            .
          </p>
          <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02] text-sm">
            {API_ENDPOINTS.map(([method, path, desc]) => (
              <div
                key={path}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <span className="w-12 shrink-0 font-mono text-xs font-semibold text-amber-300">
                  {method}
                </span>
                <span className="break-all font-mono text-xs text-white/90">
                  {path}
                </span>
                <span className="text-white/50 sm:ml-auto">{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-white/50">
            The{" "}
            <a href="/api/v1/openapi.json" className={linkClass}>
              OpenAPI 3.1 spec
            </a>{" "}
            is the machine-readable source of truth — generate a typed client
            from it. You can also query the same data from an AI agent via the{" "}
            <code className="font-mono text-xs text-white/70">/api/mcp</code> MCP
            server.
          </p>
        </section>

        {/* Requesting access */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Requesting access</h2>
          <p className="text-base leading-relaxed text-white/70">
            API access is limited to OHS families. Create an account, tell us
            what you want to build, and we review requests by hand — you&apos;ll
            get an email when you&apos;re approved, then you can reveal your key
            and start calling the endpoints.
          </p>
          <div>
            <Link
              href="/developers"
              className="inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              Request API access →
            </Link>
          </div>
        </section>

        {/* Contributing */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Contribute to the repo</h2>
          <p className="text-base leading-relaxed text-white/70">
            Everything we build is open source. Browse the code, open issues, and
            send pull requests at{" "}
            <a href={REPO_URL} className={linkClass}>
              github.com/drodio/pixelparents
            </a>
            . New to building? The{" "}
            <Link href="/builders" className={linkClass}>
              builders page
            </Link>{" "}
            has a friendly zero-to-first-PR on-ramp and setup instructions for
            Claude Code and the desktop app.
          </p>
          <p className="text-sm text-white/50">
            Read{" "}
            <a
              href="https://github.com/drodio/pixelparents/blob/main/CLAUDE.md"
              className={linkClass}
            >
              CLAUDE.md
            </a>{" "}
            and{" "}
            <a
              href="https://github.com/drodio/pixelparents/blob/main/AGENTS.md"
              className={linkClass}
            >
              AGENTS.md
            </a>{" "}
            first — they cover the branch → PR workflow and the strict no-PII /
            no-secrets rules that everything here follows.
          </p>
        </section>

        <div className="border-t border-white/10" />

        <footer className="flex flex-col items-center gap-3 text-center text-sm text-white/50">
          <p>
            These docs are a curated index — the source of truth lives in the{" "}
            <a href={REPO_URL} className={linkClass}>
              open source
            </a>{" "}
            repo.
          </p>
          <Link href="/builders" className={linkClass}>
            ← Back to builders
          </Link>
        </footer>
      </div>
    </div>
  );
}
