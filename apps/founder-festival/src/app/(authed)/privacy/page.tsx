import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · Founder Festival",
  description:
    "How Founder Festival collects, uses, and shares information about the founders and investors who use the site.",
};

export default function PrivacyPage() {
  return (
    <article className="flex flex-col flex-1 px-6 py-16 sm:py-24 bg-[#151515] text-zinc-100">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-10">
        <a
          href="/?home=1"
          aria-label="Founder Festival home"
          className="self-center opacity-90 hover:opacity-100 transition-opacity"
        >
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="w-[72px] h-auto"
          />
        </a>
        <header className="flex flex-col gap-3 border-b border-zinc-800 pb-8">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Privacy
          </h1>
          <p className="text-sm text-zinc-500">
            Last updated: May 22, 2026
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            What we collect
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            When you check your FounderScore<sup className="text-[0.55em] leading-none -ml-px">™</sup>,
            we collect the LinkedIn URL you submit and the publicly indexed
            information our research tools surface about you (press, podcasts,
            company filings, open-source activity, and similar). If you sign
            in to claim your profile, we also store the email address, name,
            and identity-provider username (LinkedIn, GitHub, etc.) returned
            by your auth provider.
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            We do not buy data about you from data brokers, and we do not
            scrape private LinkedIn content behind login walls.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            How we use it
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            We use the information to generate your FounderScore, to populate
            the leaderboard, to verify ownership when you claim a profile, and
            to send you event invitations and updates you&apos;ve opted into.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Sharing with sponsors
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            Founder Festival is supported in part by sponsors whose products
            and services are relevant to founders and investors. We may share
            your name, LinkedIn URL, and FounderScore summary with a specific
            sponsor when there is a high-signal match between your profile and
            what that sponsor is looking for — for example, a venture firm
            actively investing at your stage, or an enterprise tool that fits
            your company&apos;s profile.
          </p>
          <aside
            className="rounded-md border px-5 py-4 text-base leading-relaxed mt-2"
            style={{ borderColor: "#dfa43a", color: "#dfa43a", backgroundColor: "rgba(223,164,58,0.06)" }}
          >
            <span className="mr-2" aria-hidden>💡</span>
            <strong className="font-semibold">Here&apos;s the rule we hold ourselves to:</strong>{" "}
            We only share when we believe the introduction is useful to you,
            not just to the sponsor. We do not sell your information, we do
            not share with the open advertising ecosystem, and we do not pass
            your contact details to general marketing lists.
          </aside>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Service providers
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            We use third-party services to run Founder Festival, including
            hosting (Vercel), authentication (Clerk), web research (Exa),
            scoring (Anthropic), and analytics. These providers process the
            information described above on our behalf, under their own
            published terms.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Cookies
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            We use first-party cookies and similar storage for session
            management and basic analytics. We do not use third-party
            advertising or cross-site tracking cookies.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Data retention
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            We retain your evaluation and profile information for as long as
            your account is active. You can request deletion at any time by
            emailing us (below), and we will remove your information within
            30 days, subject to any legal obligations to retain certain
            records.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Your choices
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            You can request access to, correction of, or deletion of your
            information, and you can opt out of sponsor-match introductions
            at any time. Contact us at{" "}
            <a href="mailto:privacy@festival.so" className="link">
              privacy@festival.so
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Changes to this policy
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200">
            If we make material changes to how we handle your information,
            we&apos;ll update this page and the &ldquo;last updated&rdquo;
            date above.
          </p>
        </section>

        <footer className="border-t border-zinc-800 pt-8 mt-4">
          <a href="/?home=1" className="link text-sm">
            ← Back to Founder Festival
          </a>
        </footer>
      </div>
    </article>
  );
}
