import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Pixel Parents",
  description:
    "How Pixel Parents handles your data: opt-in only, visible just to verified OHS families, and yours to delete anytime.",
};

const REPO_URL = "https://github.com/drodio/pixelparents";

// Shared link styling matching the rest of the app (amber accent, subtle underline).
const linkCls =
  "text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300";

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col bg-black px-6 py-16 text-white sm:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className={`${linkCls} text-sm`}>
            ← Back to Pixel Parents
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-white/50">Last updated: June 2026</p>
        </header>

        <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm text-white/70">
          This is a plain-language summary, not legal advice. Pixel Parents is a
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
          <h2 className="text-xl font-bold">What we collect</h2>
          <p className="text-white/70">
            Only what you choose to share. When you sign up or fill out your
            profile, you decide what to add — your name, contact info, your
            interests, and details about your child(ren) at OHS. Nothing is
            required beyond what&apos;s needed to create your account, and you can
            leave fields blank.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Everything is opt-in</h2>
          <p className="text-white/70">
            Your information is only used to help OHS families connect around
            shared interests. Profile details are visible only to other{" "}
            <span className="font-semibold text-white/90">verified OHS families</span>{" "}
            in the community — never to the public. You control your own data, and
            any &quot;secret link&quot; you create can be kept private to just you
            or limited to verified OHS parents.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">How we keep it</h2>
          <p className="text-white/70">
            We use trusted third-party services (for example, sign-in, database,
            and email providers) to run the app. We don&apos;t sell your data, and
            we don&apos;t share it with advertisers. We only email you about your
            account, your signup, or things you opted into.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Deleting your data</h2>
          <p className="text-white/70">
            Your data is yours. You can ask us to delete it at any time and
            we&apos;ll take care of it. Use the{" "}
            <span className="font-semibold text-white/90">Report a bug or abuse</span>{" "}
            link at the bottom of the home page, or email{" "}
            <a href="mailto:hello@pixelparents.org" className={linkCls}>
              hello@pixelparents.org
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Children&apos;s information</h2>
          <p className="text-white/70">
            Because this is a community of OHS families, profiles may mention
            children. Only add what you&apos;re comfortable sharing with other
            verified families, and remember it&apos;s up to each parent to decide
            what to include.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Questions?</h2>
          <p className="text-white/70">
            We&apos;re happy to help. Reach us at{" "}
            <a href="mailto:hello@pixelparents.org" className={linkCls}>
              hello@pixelparents.org
            </a>{" "}
            or open an issue on{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              GitHub
            </a>
            .
          </p>
        </section>

        <footer className="flex gap-4 border-t border-white/10 pt-6 text-sm text-white/50">
          <Link href="/terms" className={linkCls}>
            Terms of Service
          </Link>
          <Link href="/" className={linkCls}>
            Home
          </Link>
        </footer>
      </div>
    </div>
  );
}
