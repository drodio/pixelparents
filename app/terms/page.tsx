import Link from "next/link";

export const metadata = {
  title: "Terms of Service — GoPixel",
  description:
    "The friendly, plain-language terms for using GoPixel — a free, open-source community project for Stanford OHS families.",
};

const REPO_URL = "https://github.com/drodio/pixelparents";

// Shared link styling matching the rest of the app (amber accent, subtle underline).
const linkCls =
  "text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300";

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-5 py-16 text-white sm:px-6 sm:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className={`${linkCls} text-sm`}>
            ← Back to GoPixel
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Terms of Service
          </h1>
          <p className="text-sm text-white/50">Last updated: June 2026</p>
        </header>

        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm text-white/70">
          This is a plain-language summary, not legal advice. GoPixel is a
          free, open-source community project built by and for Stanford OHS
          families. It is <span className="font-semibold text-white/90">not</span>{" "}
          affiliated with or endorsed by Stanford University or Stanford OHS. The
          full source is on{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            GitHub
          </a>
          .
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">What this is</h2>
          <p className="text-white/70">
            GoPixel is a free, community-run tool that helps Stanford OHS
            families find each other around shared interests. It&apos;s a
            volunteer, open-source project — not a business, and not an official
            Stanford service. By using it, you&apos;re joining a community of
            families who want to be good to each other.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Be a good neighbor</h2>
          <p className="text-white/70">
            You&apos;re responsible for what you post. Please keep it kind,
            honest, and relevant to the OHS community. Don&apos;t post anything
            unlawful, harmful, or that isn&apos;t yours to share, and don&apos;t
            misuse other families&apos; information. If something or someone
            crosses a line, please tell us.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Your account</h2>
          <p className="text-white/70">
            Access to family profiles is limited to verified OHS families. Please
            keep your login to yourself and let us know if you think your account
            has been misused. We may pause or remove accounts that abuse the
            community or these terms.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Provided &quot;as is&quot;</h2>
          <p className="text-white/70">
            This project is offered for free, as a labor of love, with{" "}
            <span className="font-semibold text-white/90">no warranty</span> of any
            kind. We do our best to keep it working and safe, but we can&apos;t
            promise it&apos;ll be perfect or always available. To the extent the
            law allows, the builders aren&apos;t liable for issues arising from
            your use of the app.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Leaving anytime</h2>
          <p className="text-white/70">
            You can stop using GoPixel whenever you like and request that we
            delete your data. See our{" "}
            <Link href="/privacy" className={linkCls}>
              Privacy Policy
            </Link>{" "}
            for how that works.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Changes &amp; contact</h2>
          <p className="text-white/70">
            We may update these terms as the project grows; we&apos;ll keep them
            short and post the latest here. Questions or concerns?{" "}
            <Link href="/report" className={linkCls}>
              Send us a message
            </Link>{" "}
            or open an issue on{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              GitHub
            </a>
            .
          </p>
        </section>

        <footer className="flex gap-4 border-t border-white/10 pt-6 text-sm text-white/50">
          <Link href="/privacy" className={linkCls}>
            Privacy Policy
          </Link>
          <Link href="/" className={linkCls}>
            Home
          </Link>
        </footer>
      </div>
    </div>
  );
}
